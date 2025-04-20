import { Fn, same } from "../tools/functions";
import { Pretty } from "../tools/ts";
import { Msg, MsgWith } from "./definition";

export function create<T extends string, F extends FactoryFn<any[], T>>(type: T, createMsg: F) {
    type R = TypedFactory<F>;
    return Object.assign(createMsg.bind({ type }), createMsg, {
        match: matchByType<ReturnType<typeof createMsg>>(type),
        type,
    }) as R;
}

export function matchByType<TMsg extends Msg = Msg>(type: string) {
    return (ac: Msg): ac is TMsg => ac.type === type;
}

type AnyFactoryFn = FactoryFn<any[], Msg.Type>;
type FactoryFn<I extends any[], T extends Msg.Type, TMsg extends Msg<T> = Msg<T>> = (
    this: { type: T },
    ...inputs: I
) => TMsg;

export type AnyTypedFactory = TypedFactory<AnyFactoryFn>;
export type TypedFactory<F extends FactoryFn<any[], any>> = Msg.Matcher<ReturnType<F>> & {
    type: ReturnType<F>["type"];
    T: ReturnType<F>;
} & F;

export type SimpleFactory<T extends Msg.Type, P = void> = Msg.Matcher<{ type: T; payload: P }> & {
    (payload: P): { type: T; payload: P };
    type: T;
};

export type InferMatch<TMatcher extends Msg.Matcher<any>> = TMatcher extends Msg.Matcher<infer T>
    ? T
    : never;

function pack<T extends Msg.Type, P>(type: T, payload: P): MsgWith<P, T>;
function pack<T extends Msg.Type>(type: T): Msg<T>;
function pack<T extends Msg.Type, P>(type: T, payload?: P) {
    if (!payload) return { type };
    else return { type, payload };
}

export function define<T extends string>(type: T) {
    const builders = {
        with: <P, A extends unknown[] = [payload: P]>(prepare: Fn<A, P> = same as any) =>
            create(type, (...a: A) => pack(type, prepare(...a))),
    };
    return Object.assign(
        create(type, () => pack(type)),
        builders,
    );
}

export function group<S extends string, A extends readonly KeyVal[]>(
    familyName: S,
    buildFunc: (b: ReturnType<typeof groupBuilder<S>>) => A,
) {
    const messages = buildFunc(groupBuilder(familyName));
    const result = Object.fromEntries(messages.map((entry) => [entry[0], entry[1]]));
    return result as KeyValsObj<A[number]>;
}

const groupBuilder =
    <S extends string>(prefix: S) =>
    <T extends string>(type: T) => {
        const fullType = `${prefix}/${type}` as const;
        return {
            0: type,
            1: create(fullType, () => pack(fullType)),
            with: <P, A extends any[] = [payload: P]>(prepare: Fn<A, P> = same as any) => ({
                0: type,
                1: create(fullType, (...a: A) => pack(fullType, prepare(...a))),
            }),
        };
    };

interface KeyVal<V = any> {
    0: string;
    1: V;
}

type KeyValsObj<T extends KeyVal> = Pretty<{
    [K in T[0]]: Extract<T, { 0: K }>[1];
}>;
