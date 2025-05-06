export class Next<T> implements PromiseLike<T> {
    #waiters: null | Array<(value: T) => unknown> = null;

    then<TResult>(
        this: Next<T>,
        onDone: (value: T) => TResult | PromiseLike<TResult>,
    ): PromiseLike<TResult> {
        const next = new Next<TResult>();
        if (this.#waiters == null) {
            this.#waiters = [];
        }
        this.#waiters.push((value) => {
            const result = onDone(value);
            if (result && typeof result === "object" && "then" in result) {
                result.then((value) => next.push(value));
            } else {
                next.push(result);
            }
        });
        return next;
    }

    push(this: Next<T>, value: T) {
        if (this.#waiters == null) {
            return false;
        }
        this.#waiters.forEach((listener) => {
            listener(value);
        });
        this.#waiters = null;
        return true;
    }
}
