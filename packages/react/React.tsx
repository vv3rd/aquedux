import React, { createContext, use, useCallback, useSyncExternalStore } from "react";
import { AnyStore } from "./Store";

const StoreContext = createContext<AnyStore | null>(null);

export function StoreProvider({
    store,
    children,
}: {
    store: AnyStore;
    children?: React.ReactNode;
}) {
    return <StoreContext value={store}>{children}</StoreContext>;
}

function useStore() {
    const store = use(StoreContext);
    if (store == null) {
        throw new Error("Have StoreContext");
    }
    return store;
}

export interface StoreRegistry {
    global: any;
}

export function useSelector<T, S extends keyof StoreRegistry = "global">(
    selector: (state: StoreRegistry[S]) => T,
) {
    const store = useStore();
    const snapshot = useCallback(() => selector(store.getState()), [store, selector]);
    const value = useSyncExternalStore(store.subscribe, snapshot, snapshot);
    return value;
}

export function useDispatch() {
    const store = useStore();
    return store.dispatch;
}
