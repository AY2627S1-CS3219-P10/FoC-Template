import Link from "next/link";
import { Icon } from "@/components/icon";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> YOUR CAMPUS, A LITTLE CLOSER
          </p>
          <h1>
            A little help.
            <br />A <em>better</em> campus day.
          </h1>
          <p className="hero-description">
            A coffee on the way to class. Lunch between lectures.
            <br className="desktop-break" /> Connect with friends who can lend a
            hand.
          </p>
          <Link className="button button-dark" href="/suppliers">
            Explore suppliers <Icon name="arrow" />
          </Link>
          <p className="hero-footnote">
            On your way anyway? Make someone’s day.
          </p>
        </div>
        <div className="campus-scene" aria-hidden="true">
          <div className="scene-orbit orbit-one" />
          <div className="scene-orbit orbit-two" />
          <span className="scene-spark spark-one">✳</span>
          <span className="scene-spark spark-two">✳</span>
          <div className="scene-note">
            <span className="note-dot" /> A small favour, a big difference.
          </div>
          <div className="coffee-illustration">
            <div className="cup-steam" />
            <div className="cup-lid" />
            <div className="cup-body">
              <div className="cup-sleeve">
                hey,
                <br />
                <strong>neighbour.</strong>
                <span>♡</span>
              </div>
            </div>
          </div>
          <div className="floating-delivery">
            <span className="delivery-check">
              <Icon name="check" />
            </span>
            <div>
              <strong>Coffee, with a side of kindness.</strong>
              <span>That’s the campus spirit.</span>
            </div>
          </div>
          <div className="scene-caption">GOOD THINGS GO AROUND ↗</div>
        </div>
      </section>
      <section className="steps-strip" aria-label="How it works">
        <div>
          <span className="step-number">01</span>
          <p>
            <strong>Join your campus community</strong>
            <span>Register and verify your NUS email.</span>
          </p>
        </div>
        <div>
          <span className="step-number">02</span>
          <p>
            <strong>Find your campus favourites</strong>
            <span>Browse food, shops, and printing.</span>
          </p>
        </div>
        <div>
          <span className="step-number">03</span>
          <p>
            <strong>Know where to go</strong>
            <span>Check pickup locations and hours.</span>
          </p>
        </div>
      </section>
      <section className="home-errands">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AROUND THE CORNER</p>
            <h2>Your next campus stop</h2>
            <p>
              Discover suppliers, opening hours, and pickup locations in one
              place.
            </p>
          </div>
          <Link className="text-link" href="/suppliers">
            Browse suppliers <Icon name="arrow" />
          </Link>
        </div>
        <div className="home-catalog-callout">
          <Icon name="pin" />
          <div>
            <h3>Campus favourites, all together.</h3>
            <p>Log in to see available suppliers and their pickup spots.</p>
          </div>
          <Link href="/register" className="button button-outline">
            Join the community
          </Link>
        </div>
      </section>
    </>
  );
}
