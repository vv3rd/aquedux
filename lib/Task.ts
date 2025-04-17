import { Store, StoreInTask } from "./Store";

export type AnyTask<R = any> = Task<any, R, any>;
export interface Task<TResult, TState, TCtx = {}> {
    (Task_store: StoreInTask<TState, TCtx>): TResult;
}

export namespace Task {
    export const pool = <TResult, TState, TCtx>() => {
        const tasks: Task<TResult, TState, TCtx>[] = [];
        let scheduler = tasks.push.bind(tasks);
        const lockedScheduler = () => {
            throw new Error(FUCK_TASK_POOL_CLOSED);
        };
        return {
            [Symbol.iterator]() {
                return tasks[Symbol.iterator]();
            },
            getScheduler(): typeof scheduler {
                return (task) => scheduler(task);
            },
            lockScheduler() {
                scheduler = lockedScheduler;
            },
        };
    };
}

export interface TaskScheduler<TState, TCtx = {}> {
    (TaskScheduler_taskFn: Task<void, TState, TCtx>): void;
}
export namespace TaskScheduler {
    export const scoped =
        <TStateA, TStateB, TCtx>(
            unscopedScheduler: TaskScheduler<TStateA, TCtx>,
            selector: (state: TStateA) => TStateB,
        ): TaskScheduler<TStateB, TCtx> =>
        (taskFn) => {
            unscopedScheduler((store) =>
                taskFn(Store.forTask(Store.scoped(store, selector), store.signal)),
            );
        };
}

const FUCK_TASK_POOL_CLOSED = "Can't schedule task once reducer returned";
