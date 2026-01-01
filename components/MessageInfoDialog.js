import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from 'date-fns';
import { Check, CheckCheck, Loader2 } from 'lucide-react';

export default function MessageInfoDialog({ isOpen, onClose, message: initialMessage, participantDetails }) {
    const [message, setMessage] = useState(initialMessage);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && initialMessage?._id) {
            setLoading(true);
            // Optimistic update
            setMessage(initialMessage);

            // Fetch fresh data
            fetch(`/api/messages/${initialMessage._id}`)
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) {
                        setMessage(data);
                    }
                })
                .catch(err => console.error("Failed to fetch message info:", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, initialMessage?._id]);

    if (!isOpen) return null; // Logic change: Don't return null if !message initially, wait for fetch or use initial
    if (!message) return null;

    const getMemberDetails = (userId) => {
        return participantDetails?.find(p => String(p._id) === String(userId)) || { name: 'Unknown User', avatar: null };
    };

    const UserList = ({ items, icon: Icon, iconColor }) => (
        <ScrollArea className="h-[300px] w-full pr-4">
            <div className="space-y-4">
                {items && items.length > 0 ? (
                    items.map((item, index) => {
                        const user = getMemberDetails(item.userId);
                        return (
                            <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium text-sm">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(item.at), 'PP p')}
                                        </p>
                                    </div>
                                </div>
                                <Icon className={`w-4 h-4 ${iconColor}`} />
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        No info available
                    </div>
                )}
            </div>
        </ScrollArea>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Message Info</DialogTitle>
                </DialogHeader>

                <div className="bg-muted/30 p-3 rounded-md mb-4 text-sm italic border-l-2 border-primary">
                    "{message.content}"
                </div>

                <Tabs defaultValue="read" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="read">Read By ({message.readBy?.length || 0})</TabsTrigger>
                        <TabsTrigger value="delivered">Delivered To ({message.deliveredTo?.length || 0})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="read" className="mt-4">
                        <UserList
                            items={message.readBy}
                            icon={CheckCheck}
                            iconColor="text-blue-500"
                        />
                    </TabsContent>

                    <TabsContent value="delivered" className="mt-4">
                        <UserList
                            items={message.deliveredTo}
                            icon={Check}
                            iconColor="text-muted-foreground"
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
