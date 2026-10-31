import Link from "next/link";
import { Icon } from "@/components/icon";

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p>
          <h1>
            Small errands.
            <br />A <em>stronger</em> community.
          </h1>
          <p>
            Find a campus errand that fits your route, or ask a neighbour to
            pick something up along the way.
          </p>
          <div className="home-hero-actions">
            <Link className="button home-primary-action" href="/errands">
              Browse errands <Icon name="arrow" />
            </Link>
            <Link className="button home-secondary-action" href="/suppliers">
              Explore suppliers
            </Link>
          </div>
        </div>
        <div
          className="home-community-card"
          aria-label="How Friend on Campus works"
        >
          <p className="home-card-kicker">GOOD THINGS GO AROUND</p>
          <div className="home-route-line">
            <span>
              <Icon name="pin" />
            </span>
            <div>
              <strong>Pick up nearby</strong>
              <small>Campus shops and food spots</small>
            </div>
          </div>
          <div className="home-route-divider" />
          <div className="home-route-line">
            <span>
              <Icon name="arrow" />
            </span>
            <div>
              <strong>Deliver along your route</strong>
              <small>Help a friend between classes</small>
            </div>
          </div>
          <div className="home-kindness-note">
            <Icon name="check" /> One small favour, one easier campus day.
          </div>
        </div>
      </section>

      <section className="home-paths" aria-labelledby="home-paths-title">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">START HERE</p>
            <h2 id="home-paths-title">What can we help you do?</h2>
          </div>
          <p>Everything you need for a smoother campus day, in one place.</p>
        </div>
        <div className="home-path-grid">
          <article className="home-path-card featured">
            <span className="home-path-icon">
              <Icon name="bag" />
            </span>
            <p className="eyebrow">COMMUNITY ERRANDS</p>
            <h3>Find a way to help.</h3>
            <p>
              Browse open requests, compare routes and rewards, and lend a hand
              when it suits your day.
            </p>
            <Link className="text-link" href="/errands">
              View open errands <Icon name="arrow" />
            </Link>
          </article>
          <article className="home-path-card">
            <span className="home-path-icon peach">
              <Icon name="pin" />
            </span>
            <p className="eyebrow">CAMPUS DIRECTORY</p>
            <h3>Know where to pick up.</h3>
            <p>
              Explore food, shopping, coffee, and printing locations before
              creating your request.
            </p>
            <Link className="text-link" href="/suppliers">
              Browse campus suppliers <Icon name="arrow" />
            </Link>
          </article>
        </div>
      </section>

      <section className="home-how" aria-labelledby="home-how-title">
        <div>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2 id="home-how-title">From request to doorstep.</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Create or discover</strong>
              <p>Post what you need or find an open errand nearby.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Credits stay protected</strong>
              <p>The bounty is reserved safely while the errand is underway.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Complete the handoff</strong>
              <p>Confirm delivery and reward the friend who helped.</p>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}
