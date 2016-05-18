var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var cleanCSS = require('gulp-clean-css');
var stylus = require('gulp-stylus');
var nib = require('nib');

var scripts = [
  'node_modules/socket.io-client/dist/socket.io.js',
  'node_modules/jquery/dist/jquery.js',
  'node_modules/golden-layout/dist/goldenlayout.js',
  'assets/js/modal.js',
  'node_modules/term.js/src/term.js',
  'assets/js/term.js',
  'assets/js/options.js',
  'assets/js/helpers.js',
  'assets/js/tty.js',
  'assets/js/terminal.js',
  'assets/js/layout.js',
  'assets/js/shortcuts.js'
];

var styles = [
  'assets/styl/app.styl'
];

gulp.task('scripts', function() {
  return gulp.src(scripts)
    .pipe(sourcemaps.init())
    .pipe(concat('app.js'))
    .pipe(uglify())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./static/build/'));
});

gulp.task('styles', function () {
  return gulp.src(styles)
    .pipe(sourcemaps.init())
    .pipe(stylus({
      'include css': true,
      'use': nib()
    }))
    .pipe(cleanCSS())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./static/build/'));
});

gulp.task('watch', function () {
  gulp.watch(scripts, ['scripts']);
  gulp.watch('assets/styl/**', ['styles']);
});

gulp.task('default', [
  'scripts',
  'styles'
]);