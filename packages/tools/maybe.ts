export type Maybe<T> = Just<T> | None;
export namespace Maybe {
    export function lift<T>(val: T | Maybe<T>): Maybe<T> {
        if (val instanceof Just || val instanceof None) {
            return val;
        } else {
            return new Just(val);
        }
    }

    export type Gen<R> = Generator<void, R, void>;

    export function fn<R, A extends any[]>(fn: (...args: A) => Gen<R>) {
        return (...args: A): Maybe<R> => {
            const out = fn(...args).next();
            if (out.done) {
                return new Just(out.value);
            } else {
                return new None();
            }
        };
    }
}

abstract class MaybePrototype {
    or<A, B>(this: Maybe<A>, other: Maybe<B>): Maybe<A | B> {
        if (this instanceof Just) return this;
        else return other;
    }
    abstract bind(...args: any[]): any;
}

class None extends MaybePrototype {
    bind() {
        return this;
    }

    [Symbol.iterator] = () => ({
        next: (): IteratorYieldResult<void> => ({ done: false, value: undefined }),
    });
}

class Just<T> extends MaybePrototype {
    #val: T;
    constructor(val: T) {
        super();
        this.#val = val;
    }
    bind<U>(map: (val: T) => U | Maybe<U>): Maybe<U> {
        return Maybe.lift(map(this.#val));
    }

    [Symbol.iterator] = () => ({
        next: (): IteratorReturnResult<T> => ({ done: true, value: this.#val }),
    });
}
