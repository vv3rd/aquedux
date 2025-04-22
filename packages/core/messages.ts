import { Fn, same } from "../tools/functions";
import { Dispatch, Msg, MsgWith } from "./definition";

export function typedMsgFactory<T extends string, F extends MsgFactory<Msg<T>>>(
    type: T,
    factoryFn: F,
) {
    type R = TypedMsgFactory<F>;
    return Object.assign(factoryFn.bind({ type }), factoryFn, {
        match: matchByType<ReturnType<typeof factoryFn>>(type),
        type,
    }) as R;
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
    const builders = {
        with: <P, A extends unknown[] = [payload: P]>(prepare: Fn<A, P> = same as any) =>
            typedMsgFactory(type, (...a: A) => construct(type, prepare(...a))),
    };
    return Object.assign(
        typedMsgFactory(type, () => construct(type)),
        builders,
    );
}

export function defineMsgFamily<S extends string, A extends readonly { 0: string; 1: any }[]>(
    familyName: S,
) {
    const builder = <T extends string>(type: T) => {
        const fullType = `${familyName}/${type}` as const;
        return {
            0: type,
            1: typedMsgFactory(fullType, () => construct(fullType)),
            with: <P, A extends any[] = [payload: P]>(prepare: Fn<A, P> = same as any) => ({
                0: type,
                1: typedMsgFactory(fullType, (...a: A) => construct(fullType, prepare(...a))),
            }),
        };
    };
    return (buildFunc: (b: typeof builder) => A) => {
        const messages = buildFunc(builder);
        const result = Object.fromEntries(messages.map((entry) => [entry[0], entry[1]]));
        return result as {
            [K in A[number][0]]: Extract<A[number], { 0: K }>[1];
        };
    };
}

type MsgFactoriesObj = { [key in string]: MsgFactory<Msg<any>, any[]> };

export function bindMsgFactories<T extends MsgFactoriesObj>(
    factories: T,
): (dispatch: Dispatch) => Dispatch & T;
export function bindMsgFactories(
    dispatch: Dispatch,
): <T extends MsgFactoriesObj>(msgs: T) => Dispatch & T;
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
