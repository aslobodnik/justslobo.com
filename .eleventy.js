module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/img");

  // Configure Liquid to output HTML unescaped
  eleventyConfig.setLiquidOptions({
    jsTruthy: true,
  });

  eleventyConfig.addFilter("roman", function (n) {
    const table = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let out = "";
    for (const [value, numeral] of table) {
      while (n >= value) { out += numeral; n -= value; }
    }
    return out;
  });

  // Allow HTML to pass through unescaped
  eleventyConfig.addFilter("safe", function (value) {
    return value;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
