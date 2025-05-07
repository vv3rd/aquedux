import { Fn, same } from "../tools/functions";
import { Dispatch, Msg, MsgWith } from "./control";

function typedMsgFactory<T extends string, F extends MsgFactory<Msg<T>>>(type: T, factoryFn: F) {
    type TMsg = ReturnType<typeof factoryFn>;

    return Object.assign(factoryFn, {
        match: matchByType<TMsg>(type),
        type,
    }) as TypedMsgFactory<F>;
}

export function matchByType<TMsg extends Msg = Msg>(type: string) {
    return (ac: Msg): ac is TMsg => ac.type === type;
}

export interface MsgFactory<TMsg extends Msg = Msg<any>, I extends any[] = []> {
    (...inputs: I): TMsg;
}

export type TypedMsgFactory<F extends MsgFactory> = {
    type: ReturnType<F>["type"];
    T: ReturnType<F>;
} & Msg.Matcher<ReturnType<F>> &
    F;

function construct<T extends Msg.Type, P>(type: T, payload: P): MsgWith<P, T>;
function construct<T extends Msg.Type>(type: T): Msg<T>;
function construct<T extends Msg.Type, P>(type: T, payload?: P) {
    if (!payload) return { type };
    else return { type, payload };
}

export function defineMsg<T extends string>(type: T) {
    return Object.assign(
        typedMsgFactory(type, () => construct(type)),
        {
            with<P, A extends unknown[] = [payload: P]>(prepare: Fn<A, P> = same as any) {
                return typedMsgFactory(type, (...a: A) => construct(type, prepare(...a)));
            },
        },
    );
}

export function defineMsgGroup<S extends string>(groupName: S) {
    return <T extends Record<string, any>>() => {
        const real: Record<string, unknown> = {};

        return new Proxy(real, {
            get(target, prop: string) {
                if (!(prop in target)) {
                    Object.defineProperty(real, prop, {
                        value: defineMsg(`${groupName}/${prop}`).with<unknown>(),
                        configurable: false,
                        enumerable: false,
                        writable: false,
                    });
                }
                return real[prop];
            },
        }) as {
            [K in Extract<keyof T, string>]: (payload: T[K]) => MsgWith<T[K], `${S}/${K}`>;
        };
    };
}

type MsgFactoriesObj = { [key in string]: MsgFactory<Msg.Any, any[]> };

export function bindMsgFactories<T extends MsgFactoriesObj>(
    factories: T,
): (dispatch: Dispatch) => Dispatch & T;
export function bindMsgFactories(
    dispatch: Dispatch,
): <T extends MsgFactoriesObj>(factories: T) => Dispatch & T;
export function bindMsgFactories(dispatchOrFactories: Dispatch | MsgFactoriesObj) {
    if (typeof dispatchOrFactories === "function") {
        const dispatch = dispatchOrFactories;
        return (factories: MsgFactoriesObj) => impl(dispatch, factories);
    } else {
        const factories = dispatchOrFactories;
        return (dispatch: Dispatch) => impl(dispatch, factories);
    }

    function impl(dispatch: Dispatch, factories: MsgFactoriesObj) {
        const dispatchClone = dispatch.bind(null);
        return Object.assign(
            dispatchClone,
            Object.fromEntries(
                Object.entries(factories).map(([key, val]) => [
                    key,
                    (...args: any[]) => {
                        const msg = val(...args);
                        dispatch(msg);
                        return msg;
                    },
                ]),
            ),
        );
    }
}
