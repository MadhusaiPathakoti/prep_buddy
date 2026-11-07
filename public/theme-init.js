// Applied before first paint so there's no light-mode flash for users who prefer dark.
// (An external file, not an inline <script>, so the Content-Security-Policy can forbid inline scripts.)
(function () {
  try {
    var stored = localStorage.getItem('prepbuddy:theme')
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {}
})()
