Feature: Application startup

  Scenario: The application boots against a real Postgres
    Given the application is running
    Then the Spring context is available
