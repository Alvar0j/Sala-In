require "xcodeproj"

project_path = File.expand_path("../QLabRemoteCues.xcodeproj", __dir__)
project = Xcodeproj::Project.new(project_path)
project.root_object.attributes["LastSwiftUpdateCheck"] = "2600"
project.root_object.attributes["LastUpgradeCheck"] = "2600"

app = project.new_target(:application, "QLabRemoteCues", :ios, "17.0")
tests = project.new_target(:unit_test_bundle, "QLabRemoteCuesTests", :ios, "17.0")
ui_tests = project.new_target(:ui_test_bundle, "QLabRemoteCuesUITests", :ios, "17.0")
tests.add_dependency(app)
ui_tests.add_dependency(app)

main_group = project.main_group.new_group("QLabRemoteCues", "QLabRemoteCues")
Dir.glob(File.expand_path("../QLabRemoteCues/**/*.swift", __dir__)).sort.each do |path|
  relative = path.delete_prefix(File.expand_path("../QLabRemoteCues/", __dir__))
  group = relative.split("/")[0...-1].reduce(main_group) do |parent, name|
    parent.groups.find { |g| g.display_name == name } || parent.new_group(name, name)
  end
  app.add_file_references([group.new_file(File.basename(path))])
end

resources = main_group.groups.find { |g| g.display_name == "Resources" } ||
            main_group.new_group("Resources", "Resources")
assets = resources.new_file("Assets.xcassets")
app.resources_build_phase.add_file_reference(assets)

test_group = project.main_group.new_group("QLabRemoteCuesTests", "QLabRemoteCuesTests")
Dir.glob(File.expand_path("../QLabRemoteCuesTests/*.swift", __dir__)).sort.each do |path|
  tests.add_file_references([test_group.new_file(File.basename(path))])
end

ui_group = project.main_group.new_group("QLabRemoteCuesUITests", "QLabRemoteCuesUITests")
Dir.glob(File.expand_path("../QLabRemoteCuesUITests/*.swift", __dir__)).sort.each do |path|
  ui_tests.add_file_references([ui_group.new_file(File.basename(path))])
end

app.build_configurations.each do |config|
  config.build_settings.merge!(
    "PRODUCT_BUNDLE_IDENTIFIER" => "com.example.QLabRemoteCues",
    "DEVELOPMENT_TEAM" => "GQ44QT8797",
    "CODE_SIGN_STYLE" => "Automatic",
    "INFOPLIST_FILE" => "QLabRemoteCues/Resources/Info.plist",
    "CODE_SIGN_ENTITLEMENTS" => "QLabRemoteCues/Resources/QLabRemoteCues.entitlements",
    "SWIFT_VERSION" => "6.0",
    "SWIFT_STRICT_CONCURRENCY" => "complete",
    "TARGETED_DEVICE_FAMILY" => "1,2",
    "GENERATE_INFOPLIST_FILE" => "NO",
    "ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS" => "YES",
    "ASSETCATALOG_COMPILER_APPICON_NAME" => "AppIcon"
  )
end

[tests, ui_tests].each_with_index do |target, index|
  target.build_configurations.each do |config|
    config.build_settings.merge!(
      "PRODUCT_BUNDLE_IDENTIFIER" => "com.example.QLabRemoteCues#{index == 0 ? "Tests" : "UITests"}",
      "DEVELOPMENT_TEAM" => "GQ44QT8797",
      "CODE_SIGN_STYLE" => "Automatic",
      "GENERATE_INFOPLIST_FILE" => "YES",
      "SWIFT_VERSION" => "6.0",
      "TEST_HOST" => index == 0 ? "$(BUILT_PRODUCTS_DIR)/QLabRemoteCues.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/QLabRemoteCues" : nil,
      "BUNDLE_LOADER" => index == 0 ? "$(TEST_HOST)" : nil
    ).compact!
  end
end

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(tests)
scheme.add_test_target(ui_tests)
scheme.set_launch_target(app)
scheme.save_as(project_path, "QLabRemoteCues", true)
project.save
puts project_path
