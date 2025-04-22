import React, {
    createContext,
    use,
    useCallback,
    useDebugValue,
    useMemo,
    useRef,
    useSyncExternalStore,
} from "react";
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

export function useTracedSelector<
    TArgs extends any[],
    TState extends object = {},
    TSelected = unknown,
>(selector: (state: TState, ...args: TArgs) => TSelected, ...args: TArgs): TSelected {
    const { current: before } = useRef({ selector });
    if (before.selector !== selector) {
        before.selector = selector;
        console.warn(
            "useTracedSelector expects selector arg to not change, " +
                "otherwise the hook is redundant",
        );
    }

    const deps = [selector, ...args];
    const memoized = useMemo(() => {
        let cache: null | {
            value: TSelected;
            state: TState;
            keys: Set<keyof TState>;
        } = null;

        return (state: TState) => {
            whenHasCache: if (cache) {
                for (const key of cache.keys) {
                    if (state[key] !== cache.state[key]) {
                        break whenHasCache;
                    }
                }
                return cache.value;
            }

            const keys = new Set<keyof TState>();
            const tracedState = new Proxy(state, {
                get(_, p) {
                    const key = p as keyof TState;
                    const val = state[key];
                    if (keys.has(key) === false) {
                        keys.add(key);
                    }
                    return val;
                },
            });

            const value = selector(tracedState, ...args);
            {
                cache = { state, value, keys };
            }
            return value;
        };
    }, deps);

    const value = useSelector(memoized);
    useDebugValue(value);
    return value;
}
