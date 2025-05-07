export type Fn<TParams extends any[] = [], TReturn = void> = (...params: TParams) => TReturn;
export type Fn1<TParam, TReturn = void> = (param: TParam) => TReturn;

export declare namespace Fn {
    type Like<func extends Any, but extends { returns?: any; accepts?: any[] }> = (
        ...args: but extends { accepts: {}[] } ? but["accepts"] : Parameters<func>
    ) => but extends { returns: {} } ? but["returns"] : ReturnType<func>;

    type Any = (...args: any[]) => any;

    type Arg<F extends (argument: any) => any> = F extends (argument: infer A) => any ? A : never;
    type Args<F extends Any> = F extends (...args: infer A) => any ? A : never;
}

export type Callback = () => void;
export type Procedure = () => Promise<void>;

export type GetterOf<TReturn> = () => TReturn;
export type Lazy<T> = T | GetterOf<T>;

export type Is<T> = (thing: unknown) => thing is T;

export type Narrow<From, To extends From> = (input: From) => input is To;

export const noop = () => {};
export const same = <T>(thing: T): T => thing;

export function memoOne<F extends (this: any, ...args: any[]) => any>(
    fn: F,
    isEqual: (a: Fn.Args<F>[number], b: Fn.Args<F>[number]) => boolean = Object.is,

    allEquals = (args1: Fn.Args<F>, args2: Fn.Args<F>): boolean => {
        if (args1.length !== args2.length) return false;
        for (let i = 0; i < args1.length; i++) if (!isEqual(args1[i], args2[i])) return false;
        return true;
    },
) {
    let lastThis: ThisParameterType<F>;
    let lastArgs: Parameters<F>;
    let lastResult: ReturnType<F>;

    function memoizedFunction(this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
        if (!lastArgs || this !== lastThis || !allEquals(lastArgs, args)) {
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
    { catch: doCatch, finally: doFinally }: { catch?: (err: unknown) => E; finally?: () => void },
): (...args: Parameters<F>) => ReturnType<F> | E {
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
