"use client";
// The hero's 3D scene, loaded after the page: three.js stays out of the first download, and out of what other pages
// prefetch when they link home. The empty box keeps the hero's layout while it loads.
import dynamic from "next/dynamic";

const HeroScene = dynamic(() => import("./DuelScene"), { ssr: false, loading: () => <div className="scene" aria-hidden="true" /> });
export default HeroScene;
