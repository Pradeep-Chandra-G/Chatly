// components/ReplyPreview.js
"use client";

import { X, Reply, Image as ImageIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReplyPreview({ replyTo, onCancel }) {
  if (!replyTo) return null;

  const getPreviewContent = () => {
    if (replyTo.type === "image") {
      return (
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Photo</span>
        </div>
      );
    }

    if (replyTo.type === "file") {
      return (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">{replyTo.fileName || "File"}</span>
        </div>
      );
    }

    return <p className="text-sm truncate">{replyTo.content}</p>;
  };

  return (
    <div className="bg-accent/50 border-l-4 border-primary px-3 py-2 mb-2 flex items-start gap-2">
      <Reply className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary mb-1">
          Replying to {replyTo.senderName}
        </p>
        {getPreviewContent()}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0"
        onClick={onCancel}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
