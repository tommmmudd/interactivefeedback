
console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();




// Basic Biquad stuck in bandpass mode
class Biquad
{
  constructor()
  {
    this.a0, this.b2, this.b1, this.b2;
    this.filterFreq = 100;
    this.Q = 3;
    this.V = Math.pow(10, 1.0 / 20); // 1.0 was gain, now fixed
    this.sampleRate = 44100;

    this.targetFreq = this.filterFreq;
    this.transitionTimeInSamples = 1500;
    this.transitionFreq = this.filterFreq;
    this.transitionCounter = this.transitionTimeInSamples; 


    this.prevX2 = 0; this.prevX1 = 0; this.prevY1 = 0; this.prevY2 = 0;
  }

  setFreq(newFreq)  { this.targetFreq = newFreq; this.transitionFreq = this.filterFreq; this.transitionCounter = 0; }
  //setFreq(freq) { this.filterFreq = freq; }
  setQ(_q) { this.Q = _q; }

  calcCoeffs()
  {
    let K = Math.tan(3.141592653589793 * this.filterFreq / this.sampleRate);
    let norm = 1 / (1 + K / this.Q + K * K);
    this.a0 = K / this.Q * norm;
    this.a2 = -this.a0;
    this.b1 = 2 * (K * K - 1) * norm;
    this.b2 = (1 - K / this.Q + K * K) * norm;
  }
  
  process(inVal)
  {

    if (this.transitionCounter < this.transitionTimeInSamples)
    {
      this.filterFreq += (this.targetFreq - this.transitionFreq) / this.transitionTimeInSamples;
      this.transitionCounter += 1;
      this.calcCoeffs();
    }

    let y = this.a0*inVal  +  this.a2*this.prevX2  -  this.b1*this.prevY1  -  this.b2*this.prevY2;
    this.prevX2 = this.prevX1;
    this.prevX1 = inVal;
    this.prevY2 = this.prevY1;
    this.prevY1 = y;
    return y;  
  }
}


// Moog filter based on Noise Hack implementation:
// https://noisehack.com/custom-audio-effects-javascript-web-audio-api/
// from musicdsp example: 
// http://www.musicdsp.org/showArchiveComment.php?ArchiveID=26
class Moog {

  constructor(context)
  {
    let bufferSize = 256;
    this.in1, this.in2, this.in3, this.in4, this.out1, this.out2, this.out3, this.out4;
    this.in1 = 0; this.in2 = 0; this.in3 = 0; this.in4 = 0;  this.out1 = 0; this.out2 = 0; this.out3 =  0;this.out4 = 0.0;
    
    this.cutoff = 660; // NOT between 0.0 and 1.0, now between 20-20000
    this.resonance = 1.99; // between 0.0 and 4.0

    this.targetFreq = this.cutoff;
    this.transitionTimeInSamples = 1500;
    this.transitionFreq = this.cutoff;
    this.transitionCounter = this.transitionTimeInSamples; 

    this.sampleRate = 44100; // TODO function to update this
  }

  test()
  { return 0.0; }

  process(inSamp)
  {
    var f = (2 * this.cutoff / this.sampleRate) * 1.16;
    var fb = this.resonance * (1.0 - 0.15 * f * f);

    if (this.transitionCounter < this.transitionTimeInSamples)
    {
      this.cutoff += (this.targetFreq - this.transitionFreq) / this.transitionTimeInSamples;
      this.transitionCounter += 1;
    }
    inSamp -= this.out4 * fb;
    inSamp *= 0.35013 * (f*f)*(f*f);
    this.out1 = inSamp + 0.3 * this.in1 + (1 - f) * this.out1; // Pole 1
    this.in1 = inSamp;
    this.out2 = this.out1 + 0.3 * this.in2 + (1 - f) * this.out2; // Pole 2
    this.in2 = this.out1;
    this.out3 = this.out2 + 0.3 * this.in3 + (1 - f) * this.out3; // Pole 3
    this.in3 = this.out2;
    this.out4 = this.out3 + 0.3 * this.in4 + (1 - f) * this.out4; // Pole 4
    this.in4 = this.out3;

    return this.out4;
  }
    
  setFreq(newFreq)  { this.targetFreq = newFreq; this.transitionFreq = this.cutoff; this.transitionCounter = 0; }

}



// SIMPLE DELAY CLASS - currently fixed max duration at 1000 samples..
class Delay
{
  constructor()
  {
    this.buffer = [];
    this.size = 5000;
    this.readPos = 0;
    this.writePos = 0;

    for (let i=0; i<this.size; i++)
    {
      this.buffer[i] = 0.0;
    }

  }

  readVal()
  {
      // get current value at readPos
      let outVal = this.linearInterpolation(); //this.buffer[this.readPos];
      // increment readPos
      this.readPos ++;
      
      if (this.readPos >= this.size)
          this.readPos = 0;
   
      return outVal;
  }

  linearInterpolation()
  {
      // get buffer index
      let indexA = Math.floor(this.readPos);
      let indexB = indexA + 1;
      
      // wrap
      if (indexB >= this.size)
          indexB -= this.size;
      
      let valA = this.buffer[indexA];
      let valB = this.buffer[indexB];
      
      let remainder = this.readPos - indexA;
      
      let interpolatedValue = (1-remainder)*valA  +  remainder*valB;
      
      return interpolatedValue;
      
  }

  writeVal(inputSample)
  {
      // store current value at writePos
      this.buffer[this.writePos] = inputSample;
      
      // increment writePos
      this.writePos ++;
      
      if (this.writePos >= this.size)
          this.writePos = 0;
  }

  process(inputSample)
  {
    let outVal = this.readVal(inputSample);
    this.writeVal(inputSample);
    return outVal;
  }

  setDelayTimeInSamples(delayTimeInSamples)
  {
    if (delayTimeInSamples > this.size)
        delayTimeInSamples = this.size;
    
    if (delayTimeInSamples < 1)
        delayTimeInSamples = 1;
    
    this.readPos = this.writePos - delayTimeInSamples;
    
    // if readPos < 0, then add size to readPos
    if (this.readPos < 0)
        this.readPos += this.size;
  }
}


class Feedback 
{
  constructor(context)
  {
    let blocksize = 256;
    let gain = 1;

    this.filter = new Biquad()
    this.filter.setFreq(800);
    this.filter.setQ(3);
    this.filter.calcCoeffs();

    this.delay = new Delay();
    this.delay.setDelayTimeInSamples(250);

    this.feedbackVal = 0;
    this.feedbackGain = 40.0;

    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 1, 2);

    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let inputBuffer = audioProcessingEvent.inputBuffer;
      let inputData = inputBuffer.getChannelData(0);

      let outputBuffer = audioProcessingEvent.outputBuffer;
      let outputDataL = outputBuffer.getChannelData(0);
      let outputDataR = outputBuffer.getChannelData(1);

      for (let i = 0; i < outputBuffer.length; i++) 
      {
          // make output equal to the same as the input
          //del1 = Math.atan(inputData[i] + del1*1.06);
          
          let nextInput = 0.25 * Math.atan(inputData[i] + self.feedbackVal*self.feedbackGain);

          let filtered = self.filter.process(nextInput);
          let delayed = self.delay.process(filtered);

          
          if (delayed < -1) { delayed = -1;}
          if (delayed > 1) { delayed = 1;}
          self.feedbackVal = delayed;

          //del2 = Math.atan(del1 * 1.05);

          let outputSample = filtered * 1.0;// * inputData[i];// * ();
          outputDataL[i] = outputSample;
          outputDataR[i] = outputSample;
      }
      
    }
  }

  setFreq(newFreq)  { this.filter.setFreq(newFreq); this.filter.calcCoeffs(); }

  setDelayTime(newDelayTime)  { this.delay.setDelayTimeInSamples(newDelayTime); }

  get input() {
    return this.processor;
  }

  connect(node) {
    this.processor.connect(node);
  }
}


class WhiteNoise {
  constructor(context) {
    let blocksize = 256;
    let gain = 0.1;
  
    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 2, 2);
    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let outputBuffer = audioProcessingEvent.outputBuffer;

      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        let outputData = outputBuffer.getChannelData(channel);

        for (let sample = 0; sample < outputBuffer.length; sample++) {
          // make output equal to the same as the input
          outputData[sample] = gain *(Math.random() - 0.5);
        }
      }
      
    }
  }
  
  connect(node) {
    this.processor.connect(node);
  }
};

var EnvelopeGenerator = (function(context) {
  function EnvelopeGenerator() {
    this.attackTime = 0.001;
    this.releaseTime = 0.1;
  };

  EnvelopeGenerator.prototype.trigger = function() {
    console.log("triggered!!");
    now = context.currentTime;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(0, now);
    this.param.linearRampToValueAtTime(1, now + this.attackTime);
    this.param.linearRampToValueAtTime(0, now + this.attackTime + this.releaseTime);
  };

  EnvelopeGenerator.prototype.connect = function(param) {
    this.param = param;
  };

  return EnvelopeGenerator;
})(audioContext);

class VCA {
  constructor(context) 
  {
    let blocksize = 256;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
  }
  
  get gainVal() {     return this.gain.gain;  }
  get input()   {     return this.gain;        }

  connect(node) {    this.gain.connect(node);  }
};





//============================================================================
//============================================================================
// OBJECTS



let whiteNoise = new WhiteNoise(audioContext);
let feedbackGenerator = new Feedback(audioContext);

let vca = new VCA(audioContext);
var envelope = new EnvelopeGenerator;



var delay = audioContext.createDelay(0.01);   // max delay time is 0.1 seconds
delay.delayTime.value = 0.0001; // set to 5 milliseconds

//var moogFilter = new Moog(audioContext);

/*var biquadFilter = audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
//biquadFilter.frequency = 400;
biquadFilter.Q.value = 1.8;
biquadFilter.gain.value = 2;
*/

var compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -10;
compressor.knee.value = 0;
compressor.ratio.value = 1.5;
compressor.reduction.value = -20;
compressor.attack.value = 0;
compressor.release.value = 0.2;

let feedbackGain = audioContext.createGain();
feedbackGain.gain.value = 1;

let masterGain = audioContext.createGain();
masterGain.gain.value = 0.75;

//let sourceNode = audioContext.createOscillator();
//sourceNode.type = 'sine';
//sourceNode.frequency.value = 261.6;
//sourceNode.detune.value = 0;


//============================================================================
// ROUTING

//Connect the source to the speakers
whiteNoise.connect(vca.input);
envelope.connect(vca.gainVal);
vca.connect(feedbackGenerator.input);
//vca.connect(masterGain);
feedbackGenerator.connect(masterGain);

//delay.connect(moogFilter.input);
//biquadFilter.connect(compressor);
//moogFilter.connect(compressor);
//compressor.connect(feedbackGain);
//compressor.connect(delay);
//feedbackGain.connect(delay);
//biquadFilter.connect(masterGain);
//moogFilter.connect(masterGain)
masterGain.connect(audioContext.destination)




//Make the sound audible for 100 ms
//whiteNoise.start();
//window.setTimeout(function() { sourceNode.stop(); }, 100);





//============================================================
// INTERFACE


// TRIGGER BUTTON
/*
const envButton = document.querySelector(".env-trig");
envButton.onmousedown = function() { envelope.trigger(); console.log("pressed"); }
envButton.onmouseup = function() { console.log("released"); }
*/


// JQUERY Range2DSlider

$('#slider').range2DSlider({
  grid:true,
  axis:[[0, 2, 4, 6, 8, 10],[0, 2, 4, 6, 8, 10]],
  projections:true,
  height:'500px',
  width:'500px',
  showLegend:[0,0],
  allowAxisMove:['both'],
  /*printLabel:function( val ){
    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }*/
  printLabel:function( val )
  {
    let x = val[0] * 0.1;
    var newFreq = ((x * x) * 750.0) + 55.0;
    feedbackGenerator.setFreq(newFreq); 

    let y = val[1] * 0.1;
    var newDelayTime = Math.floor((y * y) * 5000) + 1;
    feedbackGenerator.setDelayTime(newDelayTime); 

    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }
}).range2DSlider('value',[[0.5,0.5]]);

$('#slider').range2DSlider();







// POWER BUTTON
const powerButton = document.querySelector(".control-power");

if (powerButton)
{
  console.log("power button exists");
  powerButton.addEventListener('click', function() {
  if (this.dataset.power === 'on') {
    audioContext.suspend();
    this.dataset.power = 'off';
    console.log("switching off");
    powerButton.innerHTML = "Turn Audio On";
    powerButton.style.background = "#CF9CB0";
  } else if (this.dataset.power === 'off') {
    audioContext.resume();
    this.dataset.power = 'on';
    envelope.trigger();
    console.log("switching on");
    powerButton.innerHTML = "Turn Audio Off";
    powerButton.style.background = "#4CCF90";

  }
  this.setAttribute( "aria-checked", audioContext.state ? "false" : "true" );
  console.log(audioContext.state);
}, false);
}
else 
{
	console.log("power button dunt exist yet");
}

function switchOn() 
{
	audioContext.resume();
}


//============================================================
// DRAWING ANALYSER

var analyser = audioContext.createAnalyser();
masterGain.connect(analyser);
analyser.fftSize = 4096;
var bufferLength = analyser.frequencyBinCount;
var bufferToUse = bufferLength/6
console.log(bufferLength);
var dataArray = new Uint8Array(bufferToUse);

var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");


//canvasCtx.fillStyle = 'rgb(200, 100, 50)';
//canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
function draw() {

  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = 'rgb(239, 239, 239)';//  - this is #efefef?
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 2.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 150.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 75

    canvasCtx.fillStyle = 'rgb(50,50,'+(barHeight+50)+')';
    canvasCtx.fillRect(x, canvas.height - barHeight/2, barWidth, barHeight);

    x += barWidth + 1;
  }
};

draw();

