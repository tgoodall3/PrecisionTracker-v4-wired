export default {
    expo: {
      name: "precisiontracker-mobile",
      slug: "precisiontracker-mobile",
      version: "1.0.0",
      sdkVersion: "51.0.0",
      platforms: ["ios", "android", "web"],
      web: { bundler: "webpack" },
      extra: {
        API_URL: process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"
        // API_URL: process.env.EXPO_PUBLIC_API_URL || "https://precisiontracker-v4-wired-1.onrender.com"
      }
    }
  };
  z