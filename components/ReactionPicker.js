// components/ReactionPicker.js
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Smile } from "lucide-react";

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥"];

export default function ReactionPicker({
  onReactionSelect,
  existingReactions = [],
  currentUserId,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleReactionClick = (emoji) => {
    onReactionSelect(emoji);
    setIsOpen(false);
  };

  // Check if current user has reacted with each emoji
  const getUserReaction = (emoji) => {
    return existingReactions.some(
      (r) => r.emoji === emoji && r.userId === currentUserId
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-accent/50"
        >
          <Smile className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReactionClick(emoji)}
              className={`text-2xl hover:scale-125 transition-transform p-1 rounded ${
                getUserReaction(emoji) ? "bg-accent" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
