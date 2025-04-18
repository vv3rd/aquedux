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

export const noop = () => {};
export const same = <T>(thing: T): T => thing;

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

// biome-ignore format:
export function safe<F extends Fn.Any, E = never>(
    func: F,
    blocks: { catch?: (err: unknown) => E; finally?: () => void },
): (...args: Parameters<F>) => ReturnType<F> | E {
    const { catch: doCatch, finally: doFinally } = blocks;
    if (!doCatch && doFinally) {
        return (...args) => {
            try {
                let r = func(...args);
                if (r instanceof Promise) r = r.finally(doFinally);
                return r;
            } finally { doFinally(); }
        };
    }
    if (doCatch && !doFinally) {
        return (...args) => {
            try {
                let r = func(...args);
                if (r instanceof Promise) r = r.catch(doCatch);
                return r;
            } catch (err) { doCatch(err); }
        };
    }
    if (doCatch && doFinally) {
        return (...args) => {
            try {
                let r = func(...args);
                if (r instanceof Promise) r = r.catch(doCatch).finally(doFinally);
                return r;
            } catch (err) { doCatch(err); } finally { doFinally(); }
        };
    }
    return func;
}
