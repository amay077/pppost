on run argv
	if (count of argv) < 1 then error "usage: run-js.applescript list | js <window> <tab> <javascript>"

	set modeName to item 1 of argv

	if modeName is "list" then
		return my listTabs()
	else if modeName is "js" then
		if (count of argv) < 4 then error "usage: run-js.applescript js <window> <tab> <javascript>"
		set windowIndex to (item 2 of argv) as integer
		set tabIndex to (item 3 of argv) as integer
		set jsSource to item 4 of argv
		return my runJs(windowIndex, tabIndex, jsSource)
	else
		error "unknown mode: " & modeName
	end if
end run

on listTabs()
	if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING"

	set output to ""
	tell application "Google Chrome"
		repeat with w from 1 to count of windows
			repeat with t from 1 to count of tabs of window w
				set tabUrl to ""
				set tabTitle to ""
				try
					set tabUrl to URL of tab t of window w
				end try
				try
					set tabTitle to title of tab t of window w
				end try
				set output to output & w & (ASCII character 9) & t & (ASCII character 9) & tabUrl & (ASCII character 9) & tabTitle & linefeed
			end repeat
		end repeat
	end tell
	return output
end listTabs

on runJs(windowIndex, tabIndex, jsSource)
	if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING"

	tell application "Google Chrome"
		return execute tab tabIndex of window windowIndex javascript jsSource
	end tell
end runJs
