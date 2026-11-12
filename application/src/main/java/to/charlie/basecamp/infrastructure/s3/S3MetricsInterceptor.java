package to.charlie.basecamp.infrastructure.s3;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import software.amazon.awssdk.awscore.exception.AwsServiceException;
import software.amazon.awssdk.core.interceptor.Context;
import software.amazon.awssdk.core.interceptor.ExecutionAttribute;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor;
import software.amazon.awssdk.core.interceptor.SdkExecutionAttribute;

/**
 * Times every S3 call as {@code basecamp.s3.requests}, by operation and the status it ended
 * with. The SDK has nothing of its own for Micrometer, and these calls are made with its own
 * HTTP client, so {@code http.client.requests} never sees them. One execution covers all of a
 * call's retries.
 */
public class S3MetricsInterceptor implements ExecutionInterceptor {

	private static final ExecutionAttribute<Timer.Sample> SAMPLE = new ExecutionAttribute<>("basecamp.s3.sample");

	private final MeterRegistry meterRegistry;

	public S3MetricsInterceptor(final MeterRegistry meterRegistry) {
		this.meterRegistry = meterRegistry;
	}

	@Override
	public void beforeExecution(final Context.BeforeExecution context, final ExecutionAttributes attributes) {
		attributes.putAttribute(SAMPLE, Timer.start(meterRegistry));
	}

	@Override
	public void afterExecution(final Context.AfterExecution context, final ExecutionAttributes attributes) {
		stop(attributes, String.valueOf(context.httpResponse().statusCode()), "SUCCESS");
	}

	@Override
	public void onExecutionFailure(final Context.FailedExecution context, final ExecutionAttributes attributes) {
		// A missing key is how a cache miss looks from here, so it is told apart from a failure.
		final String status = context.exception() instanceof AwsServiceException e
						? String.valueOf(e.statusCode())
						: "IO_ERROR";
		stop(attributes, status, "404".equals(status) ? "NOT_FOUND" : "ERROR");
	}

	private void stop(final ExecutionAttributes attributes, final String status, final String outcome) {
		final Timer.Sample sample = attributes.getAttribute(SAMPLE);
		if (sample == null) {
			return;
		}
		final String operation = attributes.getAttribute(SdkExecutionAttribute.OPERATION_NAME);
		sample.stop(Timer.builder("basecamp.s3.requests")
						.description("S3 calls, by operation and the status they ended with")
						.tag("operation", operation != null ? operation : "unknown")
						.tag("status", status)
						.tag("outcome", outcome)
						.register(meterRegistry));
	}
}
