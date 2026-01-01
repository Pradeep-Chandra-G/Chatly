// components/MessageContextMenu.js
"use client";

import { useState, useEffect, useRef } from "react";
import { Reply, Edit, Trash2, Info } from "lucide-react";

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥"];

export default function MessageContextMenu({
  message,
  position,
  onClose,
  onReaction,
  onReply,
  onEdit,
  onDelete,
  onInfo, // New prop
  isOwnMessage,
  existingReactions = [],
  currentUserId,
}) {
  const menuRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    // Adjust position if menu would go off screen
    if (menuRef.current && position) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x, y } = position;

      // Adjust horizontal position
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }
      if (x < 0) {
        x = 10;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }
      if (y < 0) {
        y = 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!position) return null;

  const getUserReaction = (emoji) => {
    return existingReactions.some(
      (r) => r.emoji === emoji && r.userId === currentUserId
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[200px] sm:min-w-[240px]"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
        }}
      >
        {/* Quick Reactions */}
        <div className="flex gap-1 p-2 border-b border-border mb-2">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReaction(emoji);
                onClose();
              }}
              className={`text-xl sm:text-2xl hover:scale-125 transition-transform p-1 rounded ${getUserReaction(emoji) ? "bg-accent" : ""
                }`}
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-1">
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
          >
            <Reply className="w-4 h-4" />
            Reply
          </button>

          {onInfo && (
            <button
              onClick={() => {
                onInfo();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
            >
              <Info className="w-4 h-4" />
              Message Info
            </button>
          )}

          {isOwnMessage && (
            <>
              <button
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-destructive/10 text-destructive rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
