import { Cmd } from "./control";

type createScopedCmd = <TStateA, TStateB, TCtx>(
    command: Cmd<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
) => Cmd<TStateB, TCtx>;

export const createScopedCmd: createScopedCmd = (cmd, selector) => (task) => {
    cmd((ctl) => task({ ...ctl, snapshot: () => selector(ctl.snapshot()) }));
};
