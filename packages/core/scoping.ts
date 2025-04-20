import { Cmd, Control, createTaskControl, Task } from "./definition";

type createScopedControl = <TStateA, TStateB, TCtx>(
    base: Control<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
) => Control<TStateB, TCtx>;

export const createScopedControl: createScopedControl = (base, selector) => {
    return {
        ...base,
        getState() {
            return selector(base.getState());
        },
        execute(task) {
            return base.execute(createScopedTask(task, selector));
        },
    };
};

type createScopedCmd = <TStateA, TStateB, TCtx>(
    command: Cmd<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
) => Cmd<TStateB, TCtx>;

export const createScopedCmd: createScopedCmd = (command, selector) => {
    return (task) => {
        command(createScopedTask(task, selector));
    };
};

type createScopedTask = <TStateA, TStateB, TCtx, TReturn>(
    task: Task<TReturn, TStateB, TCtx>,
    selector: (state: TStateA) => TStateB,
) => Task<TReturn, TStateA, TCtx>;

export const createScopedTask: createScopedTask = (task, selector) => {
    return (ctl) => {
        const scopedCtl = createScopedControl(ctl, selector);
        const taskCtl = createTaskControl(scopedCtl, ctl.signal);
        return task(taskCtl);
    };
};
