package to.charlie.basecamp.domain.model.dto.common;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Generic pagination envelope returned by list endpoints.
 */
@Builder
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PagedResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean last
) {

	/**
	 * Wrap a Spring Data {@link Page}, mapping each element with the given function.
	 */
	public static <E, T> PagedResponse<T> from(final Page<E> page, final Function<E, T> mapper) {
		return PagedResponse.<T>builder()
						.content(page.getContent().stream().map(mapper).toList())
						.page(page.getNumber())
						.size(page.getSize())
						.totalElements(page.getTotalElements())
						.totalPages(page.getTotalPages())
						.last(page.isLast())
						.build();
	}
}
