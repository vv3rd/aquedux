export type Fn<TParams extends any[] = [], TReturn = void> = (...params: TParams) => TReturn;

export declare namespace Fn {
    type Like<func extends Any, but extends { returns?: any; accepts?: any[] }> = (
        ...args: but extends { accepts: {}[] } ? but["accepts"] : Parameters<func>
    ) => but extends { returns: {} } ? but["returns"] : ReturnType<func>;

    type Any = (...args: any[]) => any;
}

export type Callback = () => void;
export type Procedure = () => Promise<void>;

export type Get<TReturn> = () => TReturn;
export type Lazy<T> = T | Get<T>;

export type Is<T> = (thing: unknown) => thing is T;

export type Narrow<From, To extends From> = (input: From) => input is To;

export const nothing = () => {};

export const neutral = <T>(argument: T): T => argument;

export function memo<Fn extends (this: any, ...args: any[]) => any>(
    fn: Fn,
    isEqual = (args1: Parameters<Fn>, args2: Parameters<Fn>): boolean => {
        if (args1.length === args2.length) return false;
        for (let i = 0; i < args1.length; i++) if (args1[i] !== args2[i]) return false;
        return true;
    },
) {
    let lastThis: ThisParameterType<Fn>;
    let lastArgs: Parameters<Fn>;
    let lastResult: ReturnType<Fn>;

    function memoizedFunction(
        this: ThisParameterType<Fn>,
        ...args: Parameters<Fn>
    ): ReturnType<Fn> {
        if (!lastArgs || this !== lastThis || !isEqual(lastArgs, args)) {
            lastThis = this;
            lastArgs = args;
            lastResult = fn.apply(this, args);
        }
        return lastResult;
    }

    return Object.assign(memoizedFunction, fn);
}
