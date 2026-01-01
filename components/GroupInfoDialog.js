import { useState, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Assuming you have this or use Input
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch"; // Assuming ShadCN Switch
import { MoreVertical, Shield, UserX, UserCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

export default function GroupInfoDialog({
    isOpen,
    onClose,
    conversation,
    currentUserId,
    onUpdateGroup,
    onLeaveGroup
}) {
    const [activeTab, setActiveTab] = useState("info");
    const [description, setDescription] = useState(conversation?.description || "");
    const [name, setName] = useState(conversation?.name || "");
    const [isLoading, setIsLoading] = useState(false);

    const isAdmin = (userId) => {
        const admins = conversation?.admins || [conversation?.admin];
        return admins.includes(userId);
    };

    const isCurrentUserAdmin = isAdmin(currentUserId);

    const handleUpdateInfo = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/groups/${conversation._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description }),
            });

            const data = await response.json();
            if (response.ok) {
                toast.success("Group info updated");
                onUpdateGroup(data.group);
            } else {
                toast.error(data.error || "Failed to update info");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateSetting = async (key, value) => {
        // Permission check handled by API, but optimistic update possible
        try {
            const response = await fetch(`/api/groups/${conversation._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    settings: { [key]: value ? "everyone" : "admins" }
                }),
            });

            const data = await response.json();
            if (response.ok) {
                toast.success("Settings updated");
                onUpdateGroup(data.group);
            } else {
                toast.error(data.error);
            }
        } catch (error) {
            toast.error("Failed to update settings");
        }
    };

    const handlePromoteAdmin = async (userId) => {
        try {
            const response = await fetch(`/api/groups/${conversation._id}/admins`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId })
            });
            if (response.ok) {
                toast.success("Member promoted to admin");
                // Refresh or optimistic update logic
                // Ideally parent re-fetches or we assume success and update locally
                // For now, triggering a "silent" info update to refresh might work if parent supports it, 
                // or we just manually update the local object (complex).
                // Simple: Reload page or parent re-fetch. 
                // Better: parent creates a wrapper validater.
                // We'll rely on parent callback.

                // HACK: manually update local object to reflect change immediately if parent doesn't auto-fetch
                const newAdmins = [...(conversation.admins || [conversation.admin]), userId];
                onUpdateGroup({ ...conversation, admins: newAdmins });
            } else {
                const data = await response.json();
                toast.error(data.error);
            }
        } catch (error) { toast.error("Error promoting admin"); }
    };

    const handleDismissAdmin = async (userId) => {
        try {
            const response = await fetch(`/api/groups/${conversation._id}/admins?userId=${userId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                toast.success("Admin dismissed");
                const newAdmins = (conversation.admins || [conversation.admin]).filter(id => id !== userId);
                onUpdateGroup({ ...conversation, admins: newAdmins });
            } else {
                const data = await response.json();
                toast.error(data.error);
            }
        } catch (error) { toast.error("Error dismissing admin"); }
    };

    const handleRemoveMember = async (userId) => {
        try {
            const response = await fetch(`/api/groups/${conversation._id}/members?memberId=${userId}`, {
                method: "DELETE"
            });
            if (response.ok) {
                toast.success("Member removed");
                // Update local conversation participants
                const newParticipants = conversation.participants.filter(id => id !== userId);
                const newDetails = conversation.participantDetails.filter(p => p._id !== userId);
                onUpdateGroup({ ...conversation, participants: newParticipants, participantDetails: newDetails });
            } else {
                const data = await response.json();
                toast.error(data.error);
            }
        } catch (error) { toast.error("Error removing member"); }
    };

    if (!conversation) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Group Info</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="info">Info & Members</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-4">
                        <div className="flex flex-col items-center gap-2 py-4">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={conversation.avatar} />
                                <AvatarFallback>{conversation.name?.[0]}</AvatarFallback>
                            </Avatar>
                            {isCurrentUserAdmin || conversation.settings?.editInfo === 'everyone' ? (
                                <div className="w-full space-y-2">
                                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Name" className="text-center font-semibold" />
                                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="text-sm" />
                                    {(name !== conversation.name || description !== (conversation.description || "")) && (
                                        <Button size="sm" onClick={handleUpdateInfo} disabled={isLoading} className="w-full">Save Changes</Button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <h3 className="font-semibold text-lg">{conversation.name}</h3>
                                    <p className="text-sm text-muted-foreground">{conversation.description || "No description"}</p>
                                </>
                            )}
                        </div>

                        <ScrollArea className="h-[200px] rounded-md border p-4">
                            <div className="space-y-4">
                                <h4 className="text-sm font-medium leading-none">Participants ({conversation.participantDetails?.length || 0})</h4>
                                {conversation.participantDetails?.map((participant) => (
                                    <div key={participant._id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={participant.avatar} />
                                                <AvatarFallback>{participant.name?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium leading-none">{participant.name}</p>
                                                <p className="text-xs text-muted-foreground">{participant.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isAdmin(participant._id) && <Badge variant="secondary" className="text-xs">Admin</Badge>}

                                            {/* Admin Actions Menu */}
                                            {isCurrentUserAdmin && currentUserId !== participant._id && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {isAdmin(participant._id) ? (
                                                            <DropdownMenuItem onClick={() => handleDismissAdmin(participant._id)} className="text-red-600">
                                                                <ShieldOff className="w-4 h-4 mr-2" /> Dismiss as Admin
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => handlePromoteAdmin(participant._id)}>
                                                                <Shield className="w-4 h-4 mr-2" /> Make Admin
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => handleRemoveMember(participant._id)} className="text-red-600">
                                                            <UserX className="w-4 h-4 mr-2" /> Remove from Group
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                        <Button variant="destructive" className="w-full" onClick={onLeaveGroup}>
                            Leave Group
                        </Button>
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4">
                        {!isCurrentUserAdmin ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                                <Shield className="w-12 h-12 mb-2 opacity-20" />
                                <p>Only group admins can change settings.</p>
                            </div>
                        ) : (
                            <div className="space-y-6 py-4">

                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Send Messages</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {conversation.settings?.sendMessages === 'everyone' ? 'All participants' : 'Only Admins'} can send messages.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={conversation.settings?.sendMessages === 'everyone'}
                                        onCheckedChange={(checked) => handleUpdateSetting('sendMessages', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Edit Group Info</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {conversation.settings?.editInfo === 'everyone' ? 'All participants' : 'Only Admins'} can change name/icon.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={conversation.settings?.editInfo === 'everyone'}
                                        onCheckedChange={(checked) => handleUpdateSetting('editInfo', checked)}
                                    />
                                </div>

                                {/* Add Members setting omitted for brevity but follows same pattern logic if backend supported it */}

                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
