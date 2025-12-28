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

  useEffect(() => {
    if (isOpen && call) {
      if (isIncoming) {
        setCallStatus('ringing');
      } else {
        initiateCall();
      }
    }

    return () => {
      cleanup();
    };
  }, [isOpen, call]);

  useEffect(() => {
    if (!socket) return;

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
  }, [socket]);

  const initiateCall = async () => {
    try {
      setCallStatus('calling');
      
      // Get user media
      const constraints = {
        audio: true,
        video: call.type === 'video'
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current && call.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('call:initiate', {
        callId: call._id,
        receiverId: call.receiverId,
        type: call.type,
        offer: offer
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      toast.error('Failed to access camera/microphone');
      endCall();
    }
  };

  const answerCall = async () => {
    try {
      setCallStatus('connecting');
      
      // Get user media
      const constraints = {
        audio: true,
        video: call.type === 'video'
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current && call.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add local stream
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      // Set remote description from offer
      if (call.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
      }

      // Create and send answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

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
    } catch (error) {
      console.error('Error answering call:', error);
      toast.error('Failed to answer call');
      endCall();
    }
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const targetId = isIncoming ? call.callerId : call.receiverId;
        socket.emit('call:ice-candidate', {
          targetId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        endCall();
      }
    };

    return peerConnection;
  };

  const handleCallAnswered = async ({ answer }) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        setCallStatus('connected');
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async ({ candidate }) => {
    try {
      if (peerConnectionRef.current && candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
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

  const rejectCall = () => {
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
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
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
                className="w-full h-full object-cover"
              />
              
              {/* Local Video (Picture-in-Picture) */}
              <div className="absolute top-4 right-4 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-white">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Voice Call Avatar */}
          {call?.type === 'voice' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src={call.receiverAvatar} />
                <AvatarFallback>{call.receiverName?.[0]}</AvatarFallback>
              </Avatar>
              <h3 className="text-xl font-semibold">{call.receiverName}</h3>
              <p className="text-muted-foreground">{getStatusText()}</p>
            </div>
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
