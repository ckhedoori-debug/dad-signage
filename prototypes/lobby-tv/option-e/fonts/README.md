# Belwe-Light.ttf

The Grace House wordmark face. Deployed to the NUC, **deliberately not
committed** to git.

The font's own `fsType` is 0 ("installable, embedding unrestricted"), so
serving it to the kiosk browser is permitted. That flag governs *embedding*,
not *redistribution*, and `ckhedoori-debug/dad-signage` is a PUBLIC
repository, so committing the binary would be publishing an Adobe copyrighted
typeface to anyone who clones it. It is excluded in `.gitignore` for that
reason.

Source of truth: Michael's copy. If the NUC is ever rebuilt, copy it back:

    scp fonts/Belwe-Light.ttf \
      grace@grace-house.taile7d5a3.ts.net:~/grace-house/prototypes/lobby-tv/option-d/fonts/

If the file is missing the wall falls back to Cormorant Garamond, which is
what the wordmark used before 10 Sep 2026. The screen never breaks over it.
