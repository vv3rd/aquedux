import { Fn, same } from "../tools/functions";
import { Msg, MsgWith } from "./definition";

export function typedMsgFactory<T extends string, F extends MsgFactoryFn<any[], T>>(
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

type AnyMsgFactoryFn = MsgFactoryFn<any[], Msg.Type>;
type MsgFactoryFn<I extends any[], T extends Msg.Type, TMsg extends Msg<T> = Msg<T>> = (
    this: { type: T },
    ...inputs: I
) => TMsg;

export type AnyTypedMsgFactory = TypedMsgFactory<AnyMsgFactoryFn>;
export type TypedMsgFactory<F extends MsgFactoryFn<any[], any>> = Msg.Matcher<ReturnType<F>> & {
    type: ReturnType<F>["type"];
    T: ReturnType<F>;
} & F;

export type SimpleMsgFactory<T extends Msg.Type, P = void> = Msg.Matcher<{
    type: T;
    payload: P;
}> & {
    (payload: P): { type: T; payload: P };
    type: T;
};

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
