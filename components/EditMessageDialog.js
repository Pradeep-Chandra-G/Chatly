// components/EditMessageDialog.js
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Edit } from "lucide-react";
import { toast } from "sonner";

export default function EditMessageDialog({
  isOpen,
  onClose,
  message,
  onMessageEdited,
}) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && message) {
      setContent(message.content || "");
      // Focus input after dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, message]);

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    if (content.trim() === message.content) {
      toast.info("No changes made");
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/messages/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message._id,
          content: content.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Message edited");
        onMessageEdited(data.message);
        onClose();
      } else {
        toast.error(data.error || "Failed to edit message");
      }
    } catch (error) {
      console.error("Edit error:", error);
      toast.error("Failed to edit message");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Message
          </DialogTitle>
          <DialogDescription>
            Make changes to your message. Press Enter to save or Esc to cancel.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Input
            ref={inputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="w-full"
            disabled={isSaving}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground mt-2">
            {content.length}/1000 characters
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
