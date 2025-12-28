'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';

export default function CallModal({
  isOpen,
  onClose,
  call,
  socket,
  currentUserId,
  isIncoming = false
}) {
  const [callStatus, setCallStatus] = useState('initializing');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidatesQueue = useRef([]);

  useEffect(() => {
    if (!isOpen || !call) return;

    console.log('📞 Call modal opened', { call, isIncoming });

    if (isIncoming) {
      setCallStatus('ringing');
    } else {
      initiateCall();
    }

    return () => {
      cleanup();
    };
  }, [isOpen, call]);

  useEffect(() => {
    if (!socket) return;

    const handleCallAnswered = async ({ answer }) => {
      console.log('📞 Call answered, setting remote description');
      try {
        if (peerConnectionRef.current && answer) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          
          // Process queued ICE candidates
          while (iceCandidatesQueue.current.length > 0) {
            const candidate = iceCandidatesQueue.current.shift();
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          
          setCallStatus('connected');
          toast.success('Call connected');
        }
      } catch (error) {
        console.error('Error handling answer:', error);
        toast.error('Failed to connect call');
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      console.log('🧊 Received ICE candidate');
      try {
        if (peerConnectionRef.current && candidate) {
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Queue the candidate if remote description not set yet
            iceCandidatesQueue.current.push(candidate);
          }
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };

    const handleCallRejected = () => {
      toast.error('Call was rejected');
      cleanup();
      onClose();
    };

    const handleCallEnded = () => {
      toast.info('Call ended');
      cleanup();
      onClose();
    };

    socket.on('call:answered', handleCallAnswered);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:answered', handleCallAnswered);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
    };
  }, [socket, onClose]);

  const initiateCall = async () => {
    try {
      console.log('🎬 Initiating call...');
      setCallStatus('calling');
      
      // Get user media with echo cancellation
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: call.type === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      };
      
      console.log('🎥 Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Got local stream:', stream.getTracks().map(t => `${t.kind} (enabled: ${t.enabled})`));
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }

      // Create peer connection
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add local stream tracks to peer connection
      stream.getTracks().forEach((track) => {
        console.log('➕ Adding track to peer connection:', track.kind, track.label);
        const sender = peerConnection.addTrack(track, stream);
        console.log('✅ Track added, sender:', sender);
      });

      // Wait a bit for tracks to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create and send offer
      console.log('📝 Creating offer...');
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: call.type === 'video'
      });
      
      console.log('📝 Offer created:', offer.type);
      await peerConnection.setLocalDescription(offer);
      console.log('✅ Local description set');

      // Send offer through socket
      console.log('📤 Sending call initiate to receiver');
      socket.emit('call:initiate', {
        callId: call._id,
        receiverId: call.receiverId,
        type: call.type,
        offer: offer
      });
    } catch (error) {
      console.error('❌ Error initiating call:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Please allow camera/microphone access');
      } else if (error.name === 'NotFoundError') {
        toast.error('Camera/microphone not found');
      } else {
        toast.error(`Failed to access ${call.type === 'video' ? 'camera/microphone' : 'microphone'}`);
      }
      endCall();
    }
  };

  const answerCall = async () => {
    try {
      console.log('📞 Answering call...');
      setCallStatus('connecting');
      
      // Get user media
      const constraints = {
        audio: true,
        video: call.type === 'video'
      };
      
      console.log('🎥 Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Got local stream:', stream.getTracks().map(t => t.kind));
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add local stream tracks
      stream.getTracks().forEach((track) => {
        console.log('➕ Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, stream);
      });

      // Set remote description from offer
      if (call.offer) {
        console.log('📝 Setting remote description from offer');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
      }

      // Process queued ICE candidates
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }

      // Create and send answer
      console.log('📝 Creating answer...');
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('✅ Local description set');

      // Send answer through socket
      console.log('📤 Sending answer to caller');
      socket.emit('call:answer', {
        callId: call._id,
        callerId: call.callerId,
        answer: answer
      });

      // Update call status in database
      await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call._id, status: 'active' })
      });

      setCallStatus('connected');
      toast.success('Call connected');
    } catch (error) {
      console.error('❌ Error answering call:', error);
      toast.error('Failed to answer call');
      endCall();
    }
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    console.log('🔧 Creating peer connection with config:', configuration);
    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 ICE candidate generated, sending to peer');
        const targetId = isIncoming ? call.callerId : call.receiverId;
        socket.emit('call:ice-candidate', {
          targetId,
          candidate: event.candidate
        });
      } else {
        console.log('🧊 All ICE candidates have been sent');
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('🎵 Remote track received:', event.track.kind, 'streams:', event.streams.length);
      
      if (event.streams && event.streams[0]) {
        console.log('✅ Setting remote stream to video/audio element');
        
        // Force play the remote stream
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          
          // Try to play (especially important for mobile)
          const playPromise = remoteVideoRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('✅ Remote stream playing successfully');
              })
              .catch((error) => {
                console.error('❌ Error playing remote stream:', error);
                // Try again after a short delay
                setTimeout(() => {
                  remoteVideoRef.current?.play();
                }, 100);
              });
          }
        }
      } else {
        console.warn('⚠️ No streams in track event');
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('🔌 ICE connection state:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'connected') {
        setCallStatus('connected');
        toast.success('Call connected');
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        toast.warning('Connection interrupted...');
      } else if (peerConnection.iceConnectionState === 'failed') {
        toast.error('Connection failed');
        endCall();
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('🔗 Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        endCall();
      }
    };

    peerConnection.onsignalingstatechange = () => {
      console.log('📡 Signaling state:', peerConnection.signalingState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log('🧊 ICE gathering state:', peerConnection.iceGatheringState);
    };

    return peerConnection;
  };

  const rejectCall = () => {
    console.log('❌ Rejecting call');
    socket.emit('call:reject', {
      callId: call._id,
      callerId: call.callerId
    });

    fetch('/api/calls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: call._id, status: 'rejected' })
    });

    cleanup();
    onClose();
  };

  const endCall = () => {
    console.log('🔴 Ending call');
    const targetId = isIncoming ? call.callerId : call.receiverId;
    socket.emit('call:end', {
      callId: call._id,
      targetId
    });

    fetch('/api/calls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: call._id, status: 'ended' })
    });

    cleanup();
    onClose();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log('🔇 Audio', audioTrack.enabled ? 'unmuted' : 'muted');
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log('📹 Video', videoTrack.enabled ? 'on' : 'off');
      }
    }
  };

  const cleanup = () => {
    console.log('🧹 Cleaning up call resources');
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('⏹️ Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log('❌ Closed peer connection');
    }

    iceCandidatesQueue.current = [];
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'ringing':
        return 'Incoming call...';
      case 'calling':
        return 'Calling...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected';
      default:
        return 'Initializing...';
    }
  };

  if (!call) return null;

  return (
    <Dialog open={isOpen} onOpenChange={endCall}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {call?.type === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            {call?.type === 'video' ? 'Video Call' : 'Voice Call'}
          </DialogTitle>
          <DialogDescription>{getStatusText()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Container */}
          {call?.type === 'video' && (
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ height: '400px' }}>
              {/* Remote Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                className="w-full h-full object-cover"
                onLoadedMetadata={() => console.log('📺 Remote video loaded')}
                onPlay={() => console.log('▶️ Remote video playing')}
              />
              
              {/* Local Video (Picture-in-Picture) */}
              <div className="absolute top-4 right-4 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-white">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => console.log('📺 Local video loaded')}
                />
              </div>

              {/* Status Indicator */}
              {callStatus !== 'connected' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-white text-lg">{getStatusText()}</p>
                </div>
              )}
            </div>
          )}

          {/* Voice Call - Hidden audio element for remote stream */}
          {call?.type === 'voice' && (
            <>
              <audio
                ref={remoteVideoRef}
                autoPlay
                playsInline
                onLoadedMetadata={() => console.log('🔊 Remote audio loaded')}
                onPlay={() => console.log('▶️ Remote audio playing')}
              />
              <div className="flex flex-col items-center justify-center py-12">
                <Avatar className="w-24 h-24 mb-4">
                  <AvatarImage src={call.receiverAvatar} />
                  <AvatarFallback>{call.receiverName?.[0]}</AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-semibold">{call.receiverName}</h3>
                <p className="text-muted-foreground">{getStatusText()}</p>
              </div>
            </>
          )}

          {/* Call Controls */}
          <div className="flex justify-center gap-4">
            {callStatus === 'ringing' && isIncoming ? (
              <>
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full"
                  onClick={rejectCall}
                >
                  <PhoneOff className="w-5 h-5 mr-2" />
                  Reject
                </Button>
                <Button
                  size="lg"
                  className="rounded-full bg-green-500 hover:bg-green-600"
                  onClick={answerCall}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Answer
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="icon"
                  variant={isMuted ? 'destructive' : 'outline'}
                  className="rounded-full"
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>

                {call?.type === 'video' && (
                  <Button
                    size="icon"
                    variant={isVideoOff ? 'destructive' : 'outline'}
                    className="rounded-full"
                    onClick={toggleVideo}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </Button>
                )}

                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full"
                  onClick={endCall}
                >
                  <PhoneOff className="w-5 h-5 mr-2" />
                  End Call
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
