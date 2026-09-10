import Wave from "wave-engine/helpers/Wave";

// The engine helpers read execution state that may be gone; a throw here would escape
// the surrounding try and reach the timer or the stream's read path.
export function safely(run: () => void): void {
    try {
        run();
    } catch {
        /* the engine helper is unavailable */
    }
}

/** The engine's cancel flag, which reads execution state that may already be gone. */
export function isCanceled(wave: Wave): boolean {
    try {
        return wave.general.isCanceled();
    } catch {
        return false;
    }
}

/** The engine only notices a cancel between nodes, so a long request has to abort itself. */
export function abortWhenCanceled(wave: Wave): { signal: AbortSignal; stop: () => void } {
    const controller = new AbortController();
    const poller = setInterval(() => {
        if (isCanceled(wave)) controller.abort();
    }, 1_000);
    return { signal: controller.signal, stop: () => clearInterval(poller) };
}
