import { Cmd, Msg, Reducer } from "./control";

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

