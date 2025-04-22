export function panic(error: Error | string) {
    if (error instanceof Error) throw error;
    else throw new Err(error).popStackLine();
}

export function absurd<T extends never>(_: T): never {
    throw new Err("Function `absurd` should never be called").popStackLine();
}

export function assert(condition: boolean, message = "Assertion failed"): asserts condition {
    if (!condition) {
        throw new Err(message).popStackLine();
    }
}

export function todo(): never {
    throw new Err("TODO").popStackLine()
}

class Err extends Error {
    popStackLine() {
        const error = this;
        if (error.stack) {
            let stack = error.stack.split("\n");
            stack.splice(1, 1);
            error.stack = stack.join("\n");
        }
        return this;
    }
}
