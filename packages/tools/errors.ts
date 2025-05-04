export function panic(error: Error | string): never {
    if (error instanceof Error) throw error;
    else throw trimStack(new Error(error));
}

export function absurd<T extends never>(_: T): never {
    throw trimStack(new Error("Function `absurd` should never be called"));
}

export function assert(condition: boolean, message = "Assertion failed"): asserts condition {
    if (!condition) {
        throw trimStack(new Error(message));
    }
}

export function todo(): never {
    throw trimStack(new Error("TODO"));
}

function trimStack(err: Error) {
    if (err.stack) {
        const clone = new Error();
        clone.name = err.name;
        clone.message = err.message;
        clone.cause = err.cause;
        clone.stack = err.stack.split("\n").toSpliced(1, 1).join("\n");
        Object.setPrototypeOf(clone, Object.getPrototypeOf(err));
        err = clone;
    }
    return err;
}
