import type { NextPage } from "next";
import Head from "next/head";
import React from "react";
import { Header } from "@components/layout/header";
import { PageContainer } from "@components/layout/page-container";
import { HomeContent } from "@components/home/home-content";
import { Footer } from "@components/layout/footer";

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <head>
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6202902142885850"
            crossOrigin="anonymous"></script>
        </head>
        <title>Lock TF In</title>
        <meta
          name="description"
          content="Jito Bundle Your Jupiter Lockin Swaps"
        />

      </Head>
      <PageContainer>
        <Header />
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-5xl font-bold mb-4">
            It&apos;s time to {" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              LOCK THE FUCK IN
            </span>{" "}
          </h2>
          <p className="text-xl text-base-content/80 mb-8">
            Choose Tokens you&apos;d like to swap for $LOCKIN
          </p>
          <HomeContent />
        </div>
        <Footer />
      </PageContainer>
    </>
  );
};

export default Home;
