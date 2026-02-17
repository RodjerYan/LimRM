
import { useState, useEffect, useCallback } from 'react';
import { ProcessedTask } from '../types';
import { useAuth } from '../components/auth/AuthContext';

export const useTaskManager = () => {
    const { user, token } = useAuth();
    const [processedTasks, setProcessedTasks] = useState<ProcessedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadTasks = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/get-full-cache?action=get-tasks&t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setProcessedTasks(data.tasks || []);
            }
        } catch (e) {
            console.error("Failed to load tasks log:", e);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    // Check if an item (NBA or Churn card) should be visible
    const isItemVisible = useCallback((targetId: string) => {
        const task = processedTasks.find(t => t.targetId === targetId);
        if (!task) return true; // No record -> Visible

        const now = Date.now();

        if (task.type === 'delete') {
            // Deleted items are hidden until restored or auto-deleted from DB (permanently gone)
            return false; 
        }
        
        if (task.type === 'snooze') {
            // Snoozed items are hidden until snooze time passes
            if (task.snoozeUntil && now < task.snoozeUntil) {
                return false;
            }
            // If snooze time passed, it becomes visible again (effectively "expired" snooze)
            return true;
        }

        return true;
    }, [processedTasks]);

    const performAction = useCallback(async (
        targetId: string, 
        targetName: string, 
        type: 'delete' | 'snooze', 
        reason: string, 
        ownerRm: string, // NEW: Pass the RM name so we can link it to the user
        snoozeUntil?: number
    ) => {
        if (!user || !token) return;

        const newTask: ProcessedTask & { owner?: string } = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            targetId,
            targetName,
            type,
            reason,
            timestamp: Date.now(),
            user: user.email, // Who performed the action
            owner: ownerRm,   // Who owns the point (for visibility sharing)
            // If delete, set 30 day restore deadline
            restoreDeadline: type === 'delete' ? Date.now() + (30 * 24 * 60 * 60 * 1000) : undefined,
            snoozeUntil
        };

        // Optimistic update
        setProcessedTasks(prev => [...prev, newTask]);

        try {
            await fetch(`/api/get-full-cache?action=save-task`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newTask)
            });
        } catch (e) {
            console.error("Failed to save task action:", e);
            // Revert on fail? For now just log.
        }
    }, [user, token]);

    const restoreTask = useCallback(async (taskId: string) => {
        if (!token) return;

        // Optimistic update
        setProcessedTasks(prev => prev.filter(t => t.id !== taskId));

        try {
            await fetch(`/api/get-full-cache?action=restore-task`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ taskId })
            });
        } catch (e) {
            console.error("Failed to restore task:", e);
        }
    }, [token]);

    return {
        processedTasks,
        isItemVisible,
        performAction,
        restoreTask,
        isLoading,
        refreshTasks: loadTasks
    };
};
