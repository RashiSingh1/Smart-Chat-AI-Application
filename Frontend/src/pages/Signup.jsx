
import SignupCard from "../components/SignupCard";
import background from "../assets/login.gif";

function Signup() {
  return (
    <div className="page">
      <img
        src={background}
        alt="background"
        className="background"
      />

      <div className="overlay"></div>

      <SignupCard />
    </div>
  );
}

export default Signup;

