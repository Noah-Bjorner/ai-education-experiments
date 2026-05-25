export async function withRetry<T>(
    fn: () => Promise<T>, 
    /** Number of retries *after* the initial attempt. Total attempts = maxRetries + 1. */
    maxRetries = 3, 
    /** Initial delay in ms before the first retry. */
    delay = 1000,
    backoffFactor = 2,
    /** Optional predicate to decide whether an error is retryable. Return false to stop retrying. */
    shouldRetry?: (error: unknown, attemptIndex: number) => boolean
): Promise<T> {
    let lastError: unknown;
    
    // Loop from 0 (initial attempt) to maxRetries (last retry attempt)
    // This means maxRetries + 1 total attempts.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            
            if (attempt < maxRetries) { // If this was not the last allowed attempt (i.e., more retries are possible)
                // If a shouldRetry predicate is provided and it says do not retry, break early
                if (typeof shouldRetry === "function") {
                    try {
                        const retryable = shouldRetry(err, attempt);
                        if (!retryable) {
                            console.warn("Non-retryable error encountered. Aborting retries.", err);
                            break;
                        }
                    } catch (predicateError) {
                        console.warn("Error in shouldRetry predicate; treating as non-retryable.", predicateError);
                        break;
                    }
                }
                const attemptNumberForLogging = attempt + 1; // For 1-based logging (e.g., Attempt 1/4)
                const totalAttemptsForLogging = maxRetries + 1;
                const currentDelay = delay * Math.pow(backoffFactor, attempt); // Delay for the *next* attempt

                console.warn(
                    `Attempt ${attemptNumberForLogging}/${totalAttemptsForLogging} failed. ` +
                    `Retrying in ${currentDelay / 1000}s...`,
                    err
                );
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            } else {
                // All retries exhausted (this was the attempt maxRetries, which was the last retry)
                console.warn(
                    `All ${maxRetries + 1} attempts failed. Last error:`,
                    err
                );
            }
        }
    }
    
    throw lastError;
}










export async function tryProvidersInOrder<T>(
    providers: Array<{ name: string; fn: () => Promise<T> }>
  ): Promise<T> {
    const errors: unknown[] = [];
    for (const p of providers) {
      try {
        return await p.fn();
      } catch (e) {
        console.warn(`Provider failed: ${p.name}`, e);
        errors.push(e);
      }
    }
    throw new AggregateError(errors, "All providers failed");
  }
  