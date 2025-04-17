import { beforeEach, afterEach, mock } from "bun:test";
import { Component, PropsWithChildren, ReactNode, Suspense, use } from "react";

export function silenceExpectedConsoleError() {
    const logError = console.error;
    function mockLogError(error: unknown) {
        if (error instanceof Error && error.message !== ExpectedErrorMsg) {
            logError(error);
        }
    }
    beforeEach(() => {
        console.error = mock(mockLogError);
    });
    afterEach(() => {
        console.error = logError;
    });
}

export class Catch extends Component<PropsWithChildren<{ fallback?: ReactNode }>> {
    static getDerivedStateFromError = () => ({ hasError: true });
    override state = { hasError: false };
    override render = () => (this.state.hasError ? this.props.fallback : this.props.children);
}

export function Boundry({ children }: PropsWithChildren) {
    return (
        <Catch fallback={<div data-testid={ErrFallbackEl} />}>
            <Suspense fallback={<div data-testid={SusFallbackEl} />}>{children}</Suspense>
        </Catch>
    );
}

export function Await({ the: thePromise }: { the: Promise<ReactNode | void> }) {
    const output = use(thePromise) ?? null;
    return output;
}

export function sleep(timeout: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, timeout));
}

export const ExpectedErrorMsg = "Expected";
export const ErrFallbackEl = "ErrFallbackEl";
export const SusFallbackEl = "SusFallbackEl";
