export class Next<T> implements PromiseLike<T> {
    #waiters: null | Array<(value: T) => unknown> = null;

    then<TResult = T>(
        onDone?: ((value: T) => TResult | PromiseLike<TResult>) | null | undefined,
    ): PromiseLike<TResult> {
        const next = new Next<TResult>();
        if (this.#waiters == null) {
            this.#waiters = [];
        }
        this.#waiters.push((value) => {
            const result = onDone?.(value);
            if (result == null) {
                next.push(value as unknown as TResult);
            } else if (typeof result === "object" && "then" in result) {
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
