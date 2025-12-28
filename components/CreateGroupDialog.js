'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateGroupDialog({ isOpen, onClose, onGroupCreated }) {
  const [groupName, setGroupName] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen, searchQuery]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users?search=${searchQuery}`);
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUser = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    if (selectedUsers.length === 0) {
      toast.error('Please select at least one member');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          members: selectedUsers
        })
      });

      const data = await response.json();
      if (response.ok) {
        onGroupCreated(data.group);
        toast.success('Group created successfully!');
        setGroupName('');
        setSelectedUsers([]);
      } else {
        toast.error(data.error || 'Failed to create group');
      }
    } catch (error) {
      toast.error('An error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create Group
          </DialogTitle>
          <DialogDescription>Create a new group chat with multiple members</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Add Members ({selectedUsers.length} selected)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="h-[250px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user._id}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => toggleUser(user._id)}
                  >
                    <Checkbox
                      checked={selectedUsers.includes(user._id)}
                      onCheckedChange={() => toggleUser(user._id)}
                    />
                    <Avatar>
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold">{user.name}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreateGroup} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
