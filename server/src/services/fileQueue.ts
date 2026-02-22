export class FileQueue {
    private queue: Map<string, Promise<any>> = new Map();

    /**
     * Enqueue a task for a specific file path.
     * Ensures tasks for the same file execute sequentially.
     */
    async enqueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
        // Get the existing promise chain for this file, or a resolved promise if none exists
        const previousTask = this.queue.get(filePath) || Promise.resolve();

        // Chain the new task to run After the previous one completes (or fails)
        const newTask = previousTask
            .catch(() => { }) // Ignore previous errors so the queue doesn't get blocked permanently
            .then(task);

        // Update the queue with the new tail of the promise chain
        this.queue.set(filePath, newTask);

        // When this specific task is done, we don't necessarily remove it from the map 
        // to avoid race conditions with checking the map. The map just holds the latest promise tail.

        return newTask;
    }
}

// Global instance to be used by the dispatcher
export const globalFileQueue = new FileQueue();
