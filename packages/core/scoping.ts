import { TaskPush, Control, createTaskControl } from "./definition";

export function createScopedControl<TStateA, TStateB, TCtx>(
    base: Control<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
): Control<TStateB, TCtx> {
    const self: Control<TStateB, TCtx> = {
        ...base,
        getState() {
            return selector(base.getState());
        },
        execute(task) {
            return base.execute(({ signal }) => task(createTaskControl(self, signal)));
        },
    };
    return self;
}

type createScopedPush = <TStateA, TStateB, TCtx>(
    command: TaskPush<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
) => TaskPush<TStateB, TCtx>;

export const createScopedPush: createScopedPush = (command, selector) => {
    return (task) => {
        command((ctl) => {
            const scopedCtl = createScopedControl(ctl, selector);
            const taskCtl = createTaskControl(scopedCtl, ctl.signal);
            return task(taskCtl);
        });
    };
};
