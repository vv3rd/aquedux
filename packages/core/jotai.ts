import { freeze } from "../tools/objects";
import { Cmd, Msg, Reducer, Task } from "./control";

interface Wire<A> {
    address: string[];
    read: (selector: Select) => A;
}

interface WireSource<A, C> extends Wire<A> {
    init: () => A;
    fold: (val: A, msg: Msg, cmd: Cmd<A, C>) => A;
}

type AnyWire = Wire<any>;

interface Select {
    <A>(wire: Wire<A>): A;
}

function createStore() {
    const boxedValues = new WeakMap<AnyWire, { val: any }>();
    const wireSources = new WeakMap<AnyWire, Set<AnyWire>>();

    interface SelectingContext {
        subject: AnyWire;
        sources: Set<AnyWire>;
        parent: null | SelectingContext;
    }

    let selectCtx: SelectingContext | null = null;

    function select<T>(wire: Wire<T>): T {
        if (selectCtx && selectCtx.subject !== wire) {
            selectCtx.sources.add(wire);
        }
        const box = boxedValues.get(wire);
        if (box) {
            return box.val;
        }
        if (isWireSource(wire)) {
            const val = wire.init();
            mountWire(wire, val);
            return val;
        }

        selectCtx = { subject: wire, sources: new Set(), parent: selectCtx };
        try {
            const val = wire.read(select);
            mountWire(wire, val, selectCtx.sources);
            return val;
        } finally {
            selectCtx = selectCtx.parent;
        }
    }

    function mountWire<T>(wire: Wire<T>, val: T, sources?: Set<AnyWire>) {
        boxedValues.set(wire, { val });
        if (sources) {
            wireSources.set(wire, sources);
        }
    }

    function dispatch() {}

    function observe() {}
}

function isWireSource<A>(wire: Wire<A>): wire is WireSource<A, unknown> {
    return (
        "init" in wire &&
        wire.init instanceof Function &&
        "fold" in wire &&
        wire.fold instanceof Function
    );
}

interface NextMessage<TMsg = Msg> {
    then: (onReceive: (msg: TMsg) => void) => void;
}

function createCell<TVal, TCtx>(reducer: Reducer<TVal, TCtx>) {
    type TTask = Task<void, TVal, TCtx>;

    let state: TVal = Reducer.initialize(reducer);

    let nextMsg: NextMessage<Msg> | undefined;
    let waiters: Array<(msg: Msg) => void> = [];

    let pending: Msg[] = [];
    let tasks: TTask[] = [];
    const cmd = (t: TTask) => tasks.push(t);

    const control = {
        snapshot() {
            for (const msg of pending) {
                state = reducer(state, msg, cmd);
            }

            return state;
        },

        flush() {
          for (const t of tasks) {
          }
        },

        lastMessage() {
            return pending[pending.length - 1];
        },
        nextMessage() {
            return nextMsg ?? (nextMsg = { then: waiters.push.bind(waiters) });
        },

        catch(...errors: unknown[]) {
            for (const error of errors) {
                reportError(error);
            }
        },

        dispatch(msg: Msg) {
            if (msg == null) {
                return;
            }
            pending.push(msg);
        },
    };
}
