package to.charlie.integrationTests.basecamp.steps;

import io.cucumber.java.en.Then;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Declarative assertions about persisted state. The ingest endpoints have no read side, so instead
 * of a GET the scenarios assert row counts and column values straight from Postgres.
 */
public class DatabaseSteps {

	// Table/column identifiers come from feature files (trusted), but validate them anyway so a typo
	// fails clearly rather than producing a confusing SQL error.
	private static final Pattern IDENTIFIER = Pattern.compile("[a-z_][a-z0-9_]*");

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Then("the {string} table should contain {int} row")
	@Then("the {string} table should contain {int} rows")
	public void theTableShouldContainRows(final String table, final int expected) {
		final Integer count = jdbcTemplate.queryForObject(
						"select count(*) from " + identifier(table), Integer.class);
		assertEquals(expected, count, "Row count mismatch for table '" + table + "'");
	}

	@Then("the only {string} row should have {string} equal to {string}")
	public void theOnlyRowShouldHaveColumnEqualTo(final String table, final String column, final String expected) {
		final String actual = jdbcTemplate.queryForObject(
						"select " + identifier(column) + "::text from " + identifier(table), String.class);
		assertEquals(expected, actual,
						"Mismatch for column '" + column + "' of the only '" + table + "' row");
	}

	private static String identifier(final String value) {
		if (!IDENTIFIER.matcher(value).matches()) {
			throw new IllegalArgumentException("Not a valid SQL identifier: '" + value + "'");
		}
		return value;
	}
}
