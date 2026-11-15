Feature: The GoDaddy plugin on a project row
  Once the plugin is activated and installed, every site row carries the GODADDY menu, and the Plugins
  page lists the plugin with its four steps.

  Scenario: A site row offers the GODADDY menu, captioned with its link state
    Given I am on "/dev"
     Then the element ".act-menu-godaddy" should be displayed
      And I should see "GODADDY"
      And the element ".act-menu-godaddy + .act-status" should be displayed

  Scenario: An unlinked project's menu opens and says how to link it
    Given I am on "/dev"
      And I click on the element ".project-row .act-menu-godaddy button"
     Then ".uk-dropdown.uk-open" should be visible
      And I should see "Not linked to GoDaddy"

  Scenario: The plugin is listed on the Plugins page
    Given I am on "/settings/plugins"
     Then I should see "GoDaddy"
      And I should see "@webship.co/workspace-godaddy"

  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents"
     Then I should see "godaddy-deployer"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills"
     Then I should see "godaddy-hosting"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands"
     Then I should see "godaddy-status"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts"
     Then I should see "godaddy-test-then-deploy"
