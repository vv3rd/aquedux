import React, { createContext, use, useCallback, useSyncExternalStore } from "react";
import { Control } from "../core/definition";

const ControlContext = createContext<Control<unknown, unknown> | null>(null);

export function ControlProvider({
    control,
    children,
}: {
    control: Control<unknown, unknown>;

    children?: React.ReactNode;
}) {
    return <ControlContext value={control}>{children}</ControlContext>;
}

function useControl() {
    const store = use(ControlContext);
    if (store == null) {
        throw new Error("Have ControlContext");
    }
    return store;
}

export interface ControlRegistry {
    global: any;
}

export function useSelector<T, S extends keyof ControlRegistry = "global">(
    selector: (state: ControlRegistry[S]) => T,
) {
    const ctl = useControl();
    const snapshot = useCallback(() => selector(ctl.getState()), [ctl, selector]);
    const value = useSyncExternalStore(ctl.subscribe, snapshot, snapshot);
    return value;
}

export function useDispatch() {
    const ctl = useControl();
    return ctl.dispatch;
}
