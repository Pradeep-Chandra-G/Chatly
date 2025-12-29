"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

export default function CallModal({
  isOpen,
  onClose,
  call,
  socket,
  currentUserId,
  isIncoming = false,
}) {
  const [callStatus, setCallStatus] = useState("initializing");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidatesQueue = useRef([]);
  const hasInitialized = useRef(false);
  const [connectionQuality, setConnectionQuality] = useState("good");
  const disconnectTimerRef = useRef(null);
  const connectionCheckIntervalRef = useRef(null);
  const lastBytesReceivedRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !call) return;

    if (hasInitialized.current) {
      console.log("⚠️ Already initialized, skipping...");
      return;
    }
    hasInitialized.current = true;

    console.log("📞 Call modal opened", { call, isIncoming });

    if (isIncoming) {
      setCallStatus("ringing");
    } else {
      setTimeout(() => {
        initiateCall();
      }, 50);
    }

    return () => {
      cleanup();
      if (!isOpen) {
        hasInitialized.current = false;
      }
    };
  }, [isOpen, call?._id]);

  useEffect(() => {
    if (!socket) return;

    const handleCallAnswered = async ({ answer }) => {
      console.log("📞 Call answered, setting remote description");
      try {
        if (peerConnectionRef.current && answer) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );

          while (iceCandidatesQueue.current.length > 0) {
            const candidate = iceCandidatesQueue.current.shift();
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          setCallStatus("connected");
          toast.success("Call connected");
        }
      } catch (error) {
        console.error("Error handling answer:", error);
        toast.error("Failed to connect call");
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      console.log("🧊 Received ICE candidate");
      try {
        if (peerConnectionRef.current && candidate) {
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } else {
            iceCandidatesQueue.current.push(candidate);
          }
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    const handleCallRejected = () => {
      toast.error("Call was rejected");
      cleanup();
      onClose();
    };

    const handleCallEnded = () => {
      toast.info("Call ended");
      cleanup();
      onClose();
    };

    socket.on("call:answered", handleCallAnswered);
    socket.on("call:ice-candidate", handleIceCandidate);
    socket.on("call:rejected", handleCallRejected);
    socket.on("call:ended", handleCallEnded);

    return () => {
      socket.off("call:answered", handleCallAnswered);
      socket.off("call:ice-candidate", handleIceCandidate);
      socket.off("call:rejected", handleCallRejected);
      socket.off("call:ended", handleCallEnded);
    };
  }, [socket, onClose]);

  const initiateCall = async () => {
    try {
      console.log("🎬 Initiating call...");
      setCallStatus("calling");

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          call.type === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              }
            : false,
      };

      console.log("🎥 Requesting media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(
        "✅ Got local stream:",
        stream.getTracks().map((t) => `${t.kind} (enabled: ${t.enabled})`)
      );

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }

      const peerConnection = await createPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        console.log(
          "➕ Adding track to peer connection:",
          track.kind,
          track.label
        );
        const sender = peerConnection.addTrack(track, stream);
        console.log("✅ Track added, sender:", sender);
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("📝 Creating offer...");
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: call.type === "video",
      });

      console.log("📝 Offer created:", offer.type);
      await peerConnection.setLocalDescription(offer);
      console.log("✅ Local description set");

      console.log("📤 Sending call initiate to receiver");
      socket.emit("call:initiate", {
        callId: call._id,
        receiverId: call.receiverId,
        type: call.type,
        offer: offer,
      });
    } catch (error) {
      console.error("❌ Error initiating call:", error);
      if (error.name === "NotAllowedError") {
        toast.error("Please allow camera/microphone access");
      } else if (error.name === "NotFoundError") {
        toast.error("Camera/microphone not found");
      } else {
        toast.error(
          `Failed to access ${
            call.type === "video" ? "camera/microphone" : "microphone"
          }`
        );
      }
      endCall();
    }
  };

  const answerCall = async () => {
    try {
      console.log("📞 Answering call...");
      setCallStatus("connecting");

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          call.type === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              }
            : false,
      };

      console.log("🎥 Requesting media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(
        "✅ Got local stream:",
        stream.getTracks().map((t) => `${t.kind} (enabled: ${t.enabled})`)
      );

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }

      const peerConnection = await createPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        console.log(
          "➕ Adding track to peer connection:",
          track.kind,
          track.label
        );
        const sender = peerConnection.addTrack(track, stream);
        console.log("✅ Track added, sender:", sender);
      });

      if (call.offer) {
        console.log("📝 Setting remote description from offer");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(call.offer)
        );
        console.log(
          "✅ Remote description set, signaling state:",
          peerConnection.signalingState
        );
      } else {
        throw new Error("No offer received");
      }

      console.log(
        "🧊 Processing",
        iceCandidatesQueue.current.length,
        "queued ICE candidates"
      );
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log("✅ Added queued ICE candidate");
        } catch (error) {
          console.error("❌ Error adding queued ICE candidate:", error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("📝 Creating answer...");
      const answer = await peerConnection.createAnswer();
      console.log("📝 Answer created:", answer.type);

      await peerConnection.setLocalDescription(answer);
      console.log(
        "✅ Local description set, signaling state:",
        peerConnection.signalingState
      );

      console.log("📤 Sending answer to caller");
      socket.emit("call:answer", {
        callId: call._id,
        callerId: call.callerId,
        answer: answer,
      });

      await fetch("/api/calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call._id, status: "active" }),
      });

      // Don't show toast here - it will be shown when both peers connect
      setCallStatus("connected");
    } catch (error) {
      console.error("❌ Error answering call:", error);
      if (error.name === "NotAllowedError") {
        toast.error("Please allow camera/microphone access");
      } else if (error.name === "NotFoundError") {
        toast.error("Camera/microphone not found");
      } else {
        toast.error("Failed to answer call");
      }
      endCall();
    }
  };

  const checkConnectionQuality = async (pc) => {
    try {
      const stats = await pc.getStats();

      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.mediaType === "video") {
          const bytesReceived = report.bytesReceived;

          // Check if we're actually receiving data
          if (
            lastBytesReceivedRef.current > 0 &&
            bytesReceived === lastBytesReceivedRef.current
          ) {
            console.warn("⚠️ No data received in last 5 seconds");
            setConnectionQuality("poor");

            // Connection might be stale
            if (pc.iceConnectionState === "connected") {
              console.log("🔄 Restarting ICE due to stale connection");
              pc.restartIce();
            }
          } else if (bytesReceived > lastBytesReceivedRef.current) {
            // Data is flowing, connection is good
            setConnectionQuality("good");
          }

          lastBytesReceivedRef.current = bytesReceived;
        }
      });
    } catch (err) {
      console.error("Error checking connection quality:", err);
    }
  };

  const createPeerConnection = async () => {
    try {
      console.log("🔑 Fetching TURN credentials...");
      const response = await fetch("/api/turn-credentials");
      const { iceServers } = await response.json();
      console.log("✅ Got ICE servers:", iceServers.length, "servers");

      const configuration = {
        iceServers,
        iceTransportPolicy: "all",
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      };

      console.log("🔧 Creating peer connection with config");
      const peerConnection = new RTCPeerConnection(configuration);

      peerConnectionRef.current = peerConnection;

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("🧊 ICE candidate generated, sending to peer");
          const targetId = isIncoming ? call.callerId : call.receiverId;
          socket.emit("call:ice-candidate", {
            targetId,
            candidate: event.candidate,
          });
        } else {
          console.log("🧊 All ICE candidates have been sent");
        }
      };

      peerConnection.ontrack = (event) => {
        console.log(
          "🎵 Remote track received:",
          event.track.kind,
          "streams:",
          event.streams.length
        );

        if (event.streams && event.streams[0]) {
          console.log("✅ Setting remote stream to video/audio element");

          if (remoteVideoRef.current) {
            const element = remoteVideoRef.current;

            if (element.srcObject !== event.streams[0]) {
              element.srcObject = event.streams[0];

              const playPromise = element.play();

              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("✅ Remote stream playing successfully");
                  })
                  .catch((error) => {
                    console.error("❌ Error playing remote stream:", error);
                    setTimeout(() => {
                      if (element.srcObject) {
                        element
                          .play()
                          .catch((e) => console.log("Retry failed:", e));
                      }
                    }, 500);
                  });
              }
            } else {
              console.log("Stream already set, skipping to avoid interruption");
            }
          }
        } else {
          console.warn("⚠️ No streams in track event");
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          "🔌 ICE connection state:",
          peerConnection.iceConnectionState
        );

        switch (peerConnection.iceConnectionState) {
          case "connected":
          case "completed":
            // Clear any existing timers
            if (disconnectTimer) {
              clearTimeout(disconnectTimer);
              disconnectTimer = null;
            }
            if (connectionCheckInterval) {
              clearInterval(connectionCheckInterval);
            }

            setCallStatus("connected");
            toast.success("Call connected");

            // Start monitoring connection quality
            connectionCheckInterval = setInterval(() => {
              checkConnectionQuality(peerConnection);
            }, 5000); // Check every 5 seconds
            break;

          case "disconnected":
            console.warn(
              "⚠️ ICE connection disconnected, attempting to reconnect..."
            );
            toast.info("Connection interrupted, reconnecting...");

            // Give it 10 seconds to reconnect
            disconnectTimer = setTimeout(() => {
              console.error("❌ Failed to reconnect after 10 seconds");
              toast.error("Connection lost");
              endCall();
            }, 10000);

            // Try to restart ICE immediately
            if (peerConnection.restartIce) {
              peerConnection.restartIce();
            }
            break;

          case "failed":
            console.error("❌ ICE connection failed");

            // Clear any existing timers
            if (disconnectTimer) {
              clearTimeout(disconnectTimer);
              disconnectTimer = null;
            }

            // Try to restart ICE
            if (peerConnection.restartIce) {
              console.log("🔄 Restarting ICE after failure...");
              toast.error("Connection failed - trying to reconnect...");
              peerConnection.restartIce();

              // Give it 15 seconds to recover
              disconnectTimer = setTimeout(() => {
                if (peerConnection.iceConnectionState === "failed") {
                  toast.error("Unable to reconnect");
                  endCall();
                }
              }, 15000);
            } else {
              toast.error("Connection failed");
              endCall();
            }
            break;

          case "closed":
            console.log("❌ ICE connection closed");
            if (disconnectTimer) {
              clearTimeout(disconnectTimer);
            }
            if (connectionCheckInterval) {
              clearInterval(connectionCheckInterval);
            }
            break;
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          "🔌 ICE connection state:",
          peerConnection.iceConnectionState
        );

        switch (peerConnection.iceConnectionState) {
          case "connected":
          case "completed":
            // Clear any existing timers
            if (disconnectTimerRef.current) {
              clearTimeout(disconnectTimerRef.current);
              disconnectTimerRef.current = null;
            }
            if (connectionCheckIntervalRef.current) {
              clearInterval(connectionCheckIntervalRef.current);
              connectionCheckIntervalRef.current = null;
            }

            setCallStatus("connected");
            setConnectionQuality("good"); // Set quality to good
            toast.success("Call connected");

            // Start monitoring connection quality
            connectionCheckIntervalRef.current = setInterval(() => {
              checkConnectionQuality(peerConnection);
            }, 5000);
            break;

          case "disconnected":
            console.warn(
              "⚠️ ICE connection disconnected, attempting to reconnect..."
            );
            setConnectionQuality("reconnecting"); // Update UI
            toast.info("Connection interrupted, reconnecting...");

            // Give it 10 seconds to reconnect
            disconnectTimerRef.current = setTimeout(() => {
              console.error("❌ Failed to reconnect after 10 seconds");
              toast.error("Connection lost");
              endCall();
            }, 10000);

            // Try to restart ICE immediately
            if (peerConnection.restartIce) {
              peerConnection.restartIce();
            }
            break;

          case "failed":
            console.error("❌ ICE connection failed");

            // Clear any existing timers
            if (disconnectTimerRef.current) {
              clearTimeout(disconnectTimerRef.current);
              disconnectTimerRef.current = null;
            }

            setConnectionQuality("poor"); // Update UI

            // Try to restart ICE
            if (peerConnection.restartIce) {
              console.log("🔄 Restarting ICE after failure...");
              toast.error("Connection failed - trying to reconnect...");
              peerConnection.restartIce();

              // Give it 15 seconds to recover
              disconnectTimerRef.current = setTimeout(() => {
                if (peerConnection.iceConnectionState === "failed") {
                  toast.error("Unable to reconnect");
                  endCall();
                }
              }, 15000);
            } else {
              toast.error("Connection failed");
              endCall();
            }
            break;

          case "closed":
            console.log("❌ ICE connection closed");
            if (disconnectTimerRef.current) {
              clearTimeout(disconnectTimerRef.current);
              disconnectTimerRef.current = null;
            }
            if (connectionCheckIntervalRef.current) {
              clearInterval(connectionCheckIntervalRef.current);
              connectionCheckIntervalRef.current = null;
            }
            break;
        }
      };

      peerConnection.onsignalingstatechange = () => {
        console.log("📡 Signaling state:", peerConnection.signalingState);
      };

      peerConnection.onicegatheringstatechange = () => {
        console.log(
          "🧊 ICE gathering state:",
          peerConnection.iceGatheringState
        );
      };

      return peerConnection;
    } catch (error) {
      console.error("❌ Error creating peer connection:", error);
      throw error;
    }
  };

  const rejectCall = () => {
    console.log("❌ Rejecting call");
    socket.emit("call:reject", {
      callId: call._id,
      callerId: call.callerId,
    });

    fetch("/api/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: call._id, status: "rejected" }),
    });

    // Clean up and close (person rejecting doesn't need a toast notification)
    cleanup();
    onClose();
  };

  const endCall = () => {
    console.log("🔴 Ending call");
    const targetId = isIncoming ? call.callerId : call.receiverId;

    // Emit to the other person
    socket.emit("call:end", {
      callId: call._id,
      targetId,
    });

    // Update database
    fetch("/api/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: call._id, status: "ended" }),
    });

    // Clean up and close (don't show toast here - the person ending doesn't need a notification)
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log("🔇 Audio", audioTrack.enabled ? "unmuted" : "muted");
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log("📹 Video", videoTrack.enabled ? "on" : "off");
      }
    }
  };

  const cleanup = () => {
    console.log("🧹 Cleaning up call resources");

    // Clear any monitoring intervals/timeouts
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    if (connectionCheckIntervalRef.current) {
      clearInterval(connectionCheckIntervalRef.current);
      connectionCheckIntervalRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("⏹️ Stopped track:", track.kind);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onsignalingstatechange = null;
      peerConnectionRef.current.onicegatheringstatechange = null;

      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log("❌ Closed peer connection");
    }

    iceCandidatesQueue.current = [];

    // Reset connection quality
    setConnectionQuality("good");
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "ringing":
        return "Incoming call...";
      case "calling":
        return "Calling...";
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      default:
        return "Initializing...";
    }
  };

  if (!call) return null;

  return (
    <Dialog open={isOpen} onOpenChange={endCall}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] p-4 sm:p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            {call?.type === "video" ? (
              <Video className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
            {call?.type === "video" ? "Video Call" : "Voice Call"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {getStatusText()}
          </DialogDescription>

          {/* ADD THIS CONNECTION QUALITY INDICATOR */}
          {callStatus === "connected" && connectionQuality !== "good" && (
            <div className="flex items-center gap-2">
              <div className="animate-pulse w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                {connectionQuality === "poor"
                  ? "Poor Connection"
                  : "Reconnecting..."}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {call?.type === "video" && (
            <div
              className="relative bg-black rounded-lg overflow-hidden"
              style={{ height: "250px", maxHeight: "60vh" }}
            >
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                className="w-full h-full object-cover"
                onLoadedMetadata={() => console.log("📺 Remote video loaded")}
                onPlay={() => console.log("▶️ Remote video playing")}
              />

              <div className="absolute top-2 right-2 w-20 h-16 sm:w-32 sm:h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-white">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => console.log("📺 Local video loaded")}
                />
              </div>

              {callStatus !== "connected" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-white text-sm sm:text-lg">
                    {getStatusText()}
                  </p>
                </div>
              )}
            </div>
          )}

          {call?.type === "voice" && (
            <>
              <audio
                ref={remoteVideoRef}
                autoPlay
                playsInline
                onLoadedMetadata={() => console.log("🔊 Remote audio loaded")}
                onPlay={() => console.log("▶️ Remote audio playing")}
              />
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <Avatar className="w-20 h-20 sm:w-24 sm:h-24 mb-3 sm:mb-4">
                  <AvatarImage src={call.receiverAvatar} />
                  <AvatarFallback>{call.receiverName?.[0]}</AvatarFallback>
                </Avatar>
                <h3 className="text-lg sm:text-xl font-semibold">
                  {call.receiverName}
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {getStatusText()}
                </p>
              </div>
            </>
          )}

          <div className="flex justify-center gap-2 sm:gap-4">
            {callStatus === "ringing" && isIncoming ? (
              <>
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full h-12 sm:h-14 px-4 sm:px-6 text-sm sm:text-base"
                  onClick={rejectCall}
                >
                  <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Reject
                </Button>
                <Button
                  size="lg"
                  className="rounded-full bg-green-500 hover:bg-green-600 h-12 sm:h-14 px-4 sm:px-6 text-sm sm:text-base"
                  onClick={answerCall}
                >
                  <Phone className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Answer
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="icon"
                  variant={isMuted ? "destructive" : "outline"}
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12"
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </Button>

                {call?.type === "video" && (
                  <Button
                    size="icon"
                    variant={isVideoOff ? "destructive" : "outline"}
                    className="rounded-full h-10 w-10 sm:h-12 sm:w-12"
                    onClick={toggleVideo}
                  >
                    {isVideoOff ? (
                      <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </Button>
                )}

                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full h-12 sm:h-14 px-4 sm:px-6 text-sm sm:text-base"
                  onClick={endCall}
                >
                  <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
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
