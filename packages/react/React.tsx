import React, { createContext, use, useCallback, useSyncExternalStore } from "react";
import { Control, Msg } from "../core/definition";
import { bindMsgFactories, MsgFactory } from "../core/messages";
import { Wire } from "../core/wiring";

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
    const ctl = use(ControlContext);
    if (ctl == null) {
        throw new Error("Have ControlContext");
    }
    return ctl;
}

export function useSelector<T>(selector: (state: any) => T) {
    const ctl = useControl();
    const snapshot = useCallback(() => selector(ctl.getState()), [ctl, selector]);
    const value = useSyncExternalStore(ctl.subscribe, snapshot, snapshot);
    return value;
}

export function useWire<T>(wire: Wire<T>) {
    return useSelector(wire.selectOwnState);
}

export function useDispatch<T extends { [key: string]: MsgFactory<Msg<any>, any[]> }>(
    messages?: T,
) {
    const ctl = useControl();
    if (messages) {
        return bindMsgFactories(ctl.dispatch)(messages);
    } else {
        return ctl.dispatch;
    }
}
