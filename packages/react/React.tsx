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
    const value = useSyncExternalStore(
        useCallback((cb) => ctl.subscribe(cb).unsubscribe, [ctl]),
        snapshot,
        snapshot,
    );
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

    const memoized = useMemo(() => craeteTracedSelector(selector, args), [selector, ...args]);
    useDebugValue(memoized, debugTracedSelector);

    const value = useSelector(memoized);
    return value;
}

function debugTracedSelector(m: ReturnType<typeof craeteTracedSelector<any, any>>) {
    const cache = m.geCache();
    return cache && [cache.value, Object.keys(cache.keys)];
}

function craeteTracedSelector<TArgs extends any[], TState extends object = {}, TSelected = unknown>(
    selector: (state: TState, ...args: TArgs) => TSelected,
    args: TArgs,
) {
    type TKeys = Record<string, keyof TState>;

    let cache: null | {
        value: TSelected;
        state: TState;
        keys: TKeys;
    } = null;

    const tracedSelctor = (state: TState) => {
        whenHasCache: if (cache) {
            for (const key of Object.values(cache.keys)) {
                if (state[key] !== cache.state[key]) {
                    break whenHasCache;
                }
            }
            return cache.value;
        }

        const keys: TKeys = {};
        const tracedState = new Proxy(state, {
            get(target, prop: string) {
                const key = (keys[prop] = prop as keyof TState);
                const val = target[key];
                return val;
            },
        });

        cache = {
            value: selector(tracedState, ...args),
            state,
            keys,
        };
        return cache.value;
    };

    tracedSelctor.geCache = () => {
        return cache;
    };

    return tracedSelctor;
}
